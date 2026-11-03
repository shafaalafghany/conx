package redisclient

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"conx/pkg/database"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Runner executes Redis inspection, CRUD, and CLI operations
type Runner struct{}

// NewRunner creates a new Redis Runner instance
func NewRunner() *Runner {
	return &Runner{}
}

func (r *Runner) openClient(conn database.RedisConnection, password string, dbIndex int) *redis.Client {
	port := conn.Port
	if port <= 0 {
		port = 6379
	}
	if dbIndex < 0 {
		dbIndex = conn.DefaultDB
	}
	if dbIndex < 0 {
		dbIndex = 0
	}

	opts := &redis.Options{
		Addr:         fmt.Sprintf("%s:%d", conn.Host, port),
		Username:     strings.TrimSpace(conn.Username),
		Password:     password,
		DB:           dbIndex,
		DialTimeout:  6 * time.Second,
		ReadTimeout:  12 * time.Second,
		WriteTimeout: 12 * time.Second,
	}

	if conn.UseTLS {
		opts.TLSConfig = &tls.Config{
			InsecureSkipVerify: true, //nolint:gosec // Workstation GUI connecting to internal/dev Redis TLS
		}
	}

	return redis.NewClient(opts)
}

// TestConnection verifies connectivity to a Redis host with PING
func (r *Runner) TestConnection(ctx context.Context, conn database.RedisConnection, password string) (string, error) {
	client := r.openClient(conn, password, conn.DefaultDB)
	defer client.Close()

	pong, err := client.Ping(ctx).Result()
	if err != nil {
		return "", fmt.Errorf("redis connection failed: %w", err)
	}
	return fmt.Sprintf("Connected (%s)", pong), nil
}

// ScanKeys performs cursor-based non-blocking SCAN with optional pattern & type filtering
func (r *Runner) ScanKeys(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	cursor uint64,
	pattern string,
	keyType string,
	count int64,
) (*RedisScanResult, error) {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	cleanPattern := strings.TrimSpace(pattern)
	if cleanPattern == "" {
		cleanPattern = "*"
	}
	cleanType := strings.ToLower(strings.TrimSpace(keyType))
	if cleanType == "all" {
		cleanType = ""
	}
	if count <= 0 {
		count = 250
	}

	totalKeys, _ := client.DBSize(ctx).Result()

	const batchSize int64 = 500
	const maxIterations = 8

	var matchedKeys []string
	seen := make(map[string]struct{})
	currCursor := cursor
	var scannedEstimate int64
	useScanType := cleanType != ""

	for i := 0; i < maxIterations; i++ {
		var batch []string
		var next uint64
		var err error

		if useScanType {
			batch, next, err = client.ScanType(ctx, currCursor, cleanPattern, batchSize, cleanType).Result()
			if err != nil && strings.Contains(strings.ToLower(err.Error()), "syntax") {
				// Fallback for Redis < 6.0 where SCAN TYPE is unsupported
				useScanType = false
				batch, next, err = client.Scan(ctx, currCursor, cleanPattern, batchSize).Result()
			}
		} else {
			batch, next, err = client.Scan(ctx, currCursor, cleanPattern, batchSize).Result()
		}

		if err != nil {
			return nil, fmt.Errorf("SCAN failed: %w", err)
		}

		scannedEstimate += batchSize
		for _, k := range batch {
			if _, exists := seen[k]; !exists {
				seen[k] = struct{}{}
				matchedKeys = append(matchedKeys, k)
			}
		}

		currCursor = next
		if currCursor == 0 || int64(len(matchedKeys)) >= count {
			break
		}
	}

	if totalKeys > 0 && scannedEstimate > totalKeys {
		scannedEstimate = totalKeys
	}
	if currCursor == 0 && totalKeys > 0 {
		scannedEstimate = totalKeys
	}

	// Pipeline TYPE lookups for matched keys
	summaries := make([]RedisKeySummary, 0, len(matchedKeys))
	if len(matchedKeys) > 0 {
		pipe := client.Pipeline()
		typeCmds := make([]*redis.StatusCmd, len(matchedKeys))
		for i, k := range matchedKeys {
			typeCmds[i] = pipe.Type(ctx, k)
		}
		_, _ = pipe.Exec(ctx)

		for i, k := range matchedKeys {
			t, err := typeCmds[i].Result()
			if err != nil || t == "" {
				t = "unknown"
			}
			if cleanType != "" && !useScanType && t != cleanType {
				continue
			}
			summaries = append(summaries, RedisKeySummary{
				Key:  k,
				Type: t,
			})
		}
	}

	return &RedisScanResult{
		Keys:         summaries,
		NextCursor:   currCursor,
		TotalKeys:    totalKeys,
		ScannedCount: scannedEstimate,
		HasMore:      currCursor != 0,
	}, nil
}

// GetKeyDetail inspects the type, TTL, memory usage, and full value of a single Redis key
func (r *Runner) GetKeyDetail(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
) (*RedisKeyDetail, error) {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	keyType, err := client.Type(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to inspect key type: %w", err)
	}

	if keyType == "none" {
		return &RedisKeyDetail{
			Key:         key,
			Type:        "none",
			TTL:         -2,
			Exists:      false,
			HashFields:  []RedisHashField{},
			ListItems:   []RedisListItem{},
			SetMembers:  []string{},
			ZSetMembers: []RedisZSetMember{},
		}, nil
	}

	// Fetch TTL in seconds (-1 = no expiry, -2 = missing)
	ttlDur, err := client.TTL(ctx, key).Result()
	var ttlSeconds int64 = -1
	if err == nil {
		switch ttlDur {
		case -1:
			ttlSeconds = -1
		case -2:
			ttlSeconds = -2
		default:
			if ttlDur < 0 {
				ttlSeconds = -1
			} else {
				ttlSeconds = int64(ttlDur.Seconds())
			}
		}
	}

	// Best-effort MEMORY USAGE
	memBytes, memErr := client.MemoryUsage(ctx, key).Result()

	detail := &RedisKeyDetail{
		Key:         key,
		Type:        keyType,
		TTL:         ttlSeconds,
		SizeBytes:   memBytes,
		Exists:      true,
		HashFields:  []RedisHashField{},
		ListItems:   []RedisListItem{},
		SetMembers:  []string{},
		ZSetMembers: []RedisZSetMember{},
	}

	var approxSize int64 = int64(len(key))

	switch keyType {
	case "string":
		val, err := client.Get(ctx, key).Result()
		if err != nil && !errors.Is(err, redis.Nil) {
			return nil, fmt.Errorf("GET failed: %w", err)
		}
		detail.StringValue = val
		detail.Length = int64(len(val))
		approxSize += int64(len(val))

	case "hash":
		rawMap, err := client.HGetAll(ctx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("HGETALL failed: %w", err)
		}
		fields := make([]RedisHashField, 0, len(rawMap))
		for f, v := range rawMap {
			fields = append(fields, RedisHashField{Field: f, Value: v})
			approxSize += int64(len(f) + len(v))
		}
		sort.Slice(fields, func(i, j int) bool {
			return fields[i].Field < fields[j].Field
		})
		detail.HashFields = fields
		detail.Length = int64(len(fields))

	case "list":
		totalLen, _ := client.LLen(ctx, key).Result()
		vals, err := client.LRange(ctx, key, 0, 999).Result()
		if err != nil {
			return nil, fmt.Errorf("LRANGE failed: %w", err)
		}
		items := make([]RedisListItem, 0, len(vals))
		for idx, v := range vals {
			items = append(items, RedisListItem{Index: int64(idx), Value: v})
			approxSize += int64(len(v))
		}
		detail.ListItems = items
		detail.Length = totalLen

	case "set":
		totalCard, _ := client.SCard(ctx, key).Result()
		members, err := client.SMembers(ctx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("SMEMBERS failed: %w", err)
		}
		sort.Strings(members)
		for _, m := range members {
			approxSize += int64(len(m))
		}
		detail.SetMembers = members
		detail.Length = totalCard

	case "zset":
		totalCard, _ := client.ZCard(ctx, key).Result()
		zvals, err := client.ZRangeWithScores(ctx, key, 0, 999).Result()
		if err != nil {
			return nil, fmt.Errorf("ZRANGE failed: %w", err)
		}
		zitems := make([]RedisZSetMember, 0, len(zvals))
		for _, z := range zvals {
			memberStr := fmt.Sprintf("%v", z.Member)
			zitems = append(zitems, RedisZSetMember{
				Member: memberStr,
				Score:  z.Score,
			})
			approxSize += int64(len(memberStr)) + 8
		}
		detail.ZSetMembers = zitems
		detail.Length = totalCard

	case "stream":
		xlen, _ := client.XLen(ctx, key).Result()
		msgs, err := client.XRangeN(ctx, key, "-", "+", 200).Result()
		if err == nil {
			encoded, _ := json.MarshalIndent(msgs, "", "  ")
			detail.StringValue = string(encoded)
			approxSize += int64(len(encoded))
		}
		detail.Length = xlen
	}

	if memErr != nil || detail.SizeBytes <= 0 {
		detail.SizeBytes = approxSize
	}

	return detail, nil
}

// SetKey creates or overwrites a Redis key of the specified data type and optional TTL
func (r *Runner) SetKey(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	req RedisSetKeyRequest,
) error {
	if strings.TrimSpace(req.Key) == "" {
		return fmt.Errorf("key name is required")
	}

	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	key := req.Key
	targetType := strings.ToLower(strings.TrimSpace(req.Type))

	// Clear existing key if overwriting with potentially different type
	_ = client.Del(ctx, key).Err()

	switch targetType {
	case "string":
		var exp time.Duration
		if req.TTL > 0 {
			exp = time.Duration(req.TTL) * time.Second
		}
		return client.Set(ctx, key, req.StringValue, exp).Err()

	case "hash":
		if len(req.HashFields) == 0 {
			return fmt.Errorf("at least one hash field is required")
		}
		pairs := make([]interface{}, 0, len(req.HashFields)*2)
		for _, hf := range req.HashFields {
			if strings.TrimSpace(hf.Field) == "" {
				continue
			}
			pairs = append(pairs, hf.Field, hf.Value)
		}
		if len(pairs) == 0 {
			return fmt.Errorf("at least one non-empty hash field name is required")
		}
		if err := client.HSet(ctx, key, pairs...).Err(); err != nil {
			return err
		}

	case "list":
		if len(req.ListValues) == 0 {
			return fmt.Errorf("at least one list item is required")
		}
		vals := make([]interface{}, len(req.ListValues))
		for i, v := range req.ListValues {
			vals[i] = v
		}
		if err := client.RPush(ctx, key, vals...).Err(); err != nil {
			return err
		}

	case "set":
		if len(req.SetMembers) == 0 {
			return fmt.Errorf("at least one set member is required")
		}
		vals := make([]interface{}, len(req.SetMembers))
		for i, v := range req.SetMembers {
			vals[i] = v
		}
		if err := client.SAdd(ctx, key, vals...).Err(); err != nil {
			return err
		}

	case "zset":
		if len(req.ZSetMembers) == 0 {
			return fmt.Errorf("at least one sorted set member is required")
		}
		zmembers := make([]redis.Z, len(req.ZSetMembers))
		for i, zm := range req.ZSetMembers {
			zmembers[i] = redis.Z{Score: zm.Score, Member: zm.Member}
		}
		if err := client.ZAdd(ctx, key, zmembers...).Err(); err != nil {
			return err
		}

	default:
		return fmt.Errorf("unsupported Redis key type: %s", req.Type)
	}

	if req.TTL > 0 {
		_ = client.Expire(ctx, key, time.Duration(req.TTL)*time.Second).Err()
	}

	return nil
}

// UpdateStringValue updates a string key while preserving its existing remaining TTL
func (r *Runner) UpdateStringValue(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	value string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	pttl, err := client.PTTL(ctx, key).Result()
	var exp time.Duration
	if err == nil && pttl > 0 {
		exp = pttl
	}
	return client.Set(ctx, key, value, exp).Err()
}

// SetHashField sets or renames a field inside a Redis Hash
func (r *Runner) SetHashField(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	oldField string,
	field string,
	value string,
) error {
	if strings.TrimSpace(field) == "" {
		return fmt.Errorf("field name cannot be empty")
	}
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	pipe := client.Pipeline()
	pipe.HSet(ctx, key, field, value)
	if oldField != "" && oldField != field {
		pipe.HDel(ctx, key, oldField)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// DeleteHashField deletes a field from a Redis Hash
func (r *Runner) DeleteHashField(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	field string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.HDel(ctx, key, field).Err()
}

// PushListValue pushes a new item to the head or tail of a Redis List
func (r *Runner) PushListValue(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	value string,
	position string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	if strings.ToLower(position) == "head" || strings.ToLower(position) == "left" {
		return client.LPush(ctx, key, value).Err()
	}
	return client.RPush(ctx, key, value).Err()
}

// UpdateListValue updates the item at a specific index in a Redis List
func (r *Runner) UpdateListValue(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	index int64,
	value string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.LSet(ctx, key, index, value).Err()
}

// DeleteListIndex removes an item at a specific index in a Redis List
func (r *Runner) DeleteListIndex(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	index int64,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	sentinel := "__CONX_DELETED_" + uuid.NewString() + "__"
	if err := client.LSet(ctx, key, index, sentinel).Err(); err != nil {
		return err
	}
	return client.LRem(ctx, key, 1, sentinel).Err()
}

// AddSetMember adds a member to a Redis Set
func (r *Runner) AddSetMember(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	member string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.SAdd(ctx, key, member).Err()
}

// RemoveSetMember removes a member from a Redis Set
func (r *Runner) RemoveSetMember(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	member string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.SRem(ctx, key, member).Err()
}

// AddZSetMember adds or updates a scored member in a Redis Sorted Set
func (r *Runner) AddZSetMember(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	member string,
	score float64,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.ZAdd(ctx, key, redis.Z{Score: score, Member: member}).Err()
}

// RemoveZSetMember removes a member from a Redis Sorted Set
func (r *Runner) RemoveZSetMember(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	member string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.ZRem(ctx, key, member).Err()
}

// UpdateKeyTTL sets or clears (PERSIST) expiration on a Redis key
func (r *Runner) UpdateKeyTTL(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
	ttlSeconds int64,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	if ttlSeconds < 0 {
		return client.Persist(ctx, key).Err()
	}
	return client.Expire(ctx, key, time.Duration(ttlSeconds)*time.Second).Err()
}

// DeleteKey deletes a key from Redis
func (r *Runner) DeleteKey(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	key string,
) error {
	client := r.openClient(conn, password, dbIndex)
	defer client.Close()
	return client.Del(ctx, key).Err()
}

// ExecuteCommand parses and executes an arbitrary Redis CLI command (e.g. "HGETALL user:1")
func (r *Runner) ExecuteCommand(
	ctx context.Context,
	conn database.RedisConnection,
	password string,
	dbIndex int,
	rawCommand string,
) (*RedisCommandResult, error) {
	trimmed := strings.TrimSpace(rawCommand)
	if trimmed == "" {
		return nil, fmt.Errorf("command cannot be empty")
	}

	tokens, err := tokenizeRedisCommand(trimmed)
	if err != nil {
		return &RedisCommandResult{
			Command: trimmed,
			Error:   err.Error(),
		}, err
	}
	if len(tokens) == 0 {
		return nil, fmt.Errorf("command cannot be empty")
	}

	args := make([]interface{}, len(tokens))
	for i, t := range tokens {
		args[i] = t
	}

	client := r.openClient(conn, password, dbIndex)
	defer client.Close()

	start := time.Now()
	val, cmdErr := client.Do(ctx, args...).Result()
	elapsed := time.Since(start).Milliseconds()

	if errors.Is(cmdErr, redis.Nil) {
		return &RedisCommandResult{
			Command:         trimmed,
			Output:          "(nil)",
			ExecutionTimeMs: elapsed,
		}, nil
	}
	if cmdErr != nil {
		return &RedisCommandResult{
			Command:         trimmed,
			Output:          fmt.Sprintf("(error) %v", cmdErr),
			ExecutionTimeMs: elapsed,
			Error:           cmdErr.Error(),
		}, nil
	}

	return &RedisCommandResult{
		Command:         trimmed,
		Output:          formatRedisReply(val, ""),
		ExecutionTimeMs: elapsed,
	}, nil
}

// tokenizeRedisCommand splits a CLI string into arguments, respecting single and double quotes
func tokenizeRedisCommand(input string) ([]string, error) {
	var args []string
	var current strings.Builder
	inToken := false
	var quoteChar rune

	runes := []rune(input)
	for i := 0; i < len(runes); i++ {
		ch := runes[i]

		if quoteChar != 0 {
			if ch == '\\' && i+1 < len(runes) {
				next := runes[i+1]
				switch next {
				case 'n':
					current.WriteRune('\n')
				case 'r':
					current.WriteRune('\r')
				case 't':
					current.WriteRune('\t')
				default:
					current.WriteRune(next)
				}
				i++
				continue
			}
			if ch == quoteChar {
				quoteChar = 0
				continue
			}
			current.WriteRune(ch)
			continue
		}

		if ch == '"' || ch == '\'' {
			quoteChar = ch
			inToken = true
			continue
		}

		if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
			if inToken {
				args = append(args, current.String())
				current.Reset()
				inToken = false
			}
			continue
		}

		inToken = true
		current.WriteRune(ch)
	}

	if quoteChar != 0 {
		return nil, fmt.Errorf("unclosed quote in command")
	}
	if inToken {
		args = append(args, current.String())
	}

	return args, nil
}

func formatRedisReply(val interface{}, indent string) string {
	switch v := val.(type) {
	case nil:
		return "(nil)"
	case string:
		if strings.Contains(v, "\n") {
			return v
		}
		return fmt.Sprintf("%q", v)
	case []byte:
		s := string(v)
		if strings.Contains(s, "\n") {
			return s
		}
		return fmt.Sprintf("%q", s)
	case int64:
		return fmt.Sprintf("(integer) %d", v)
	case int:
		return fmt.Sprintf("(integer) %d", v)
	case float64:
		return fmt.Sprintf("%g", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case []interface{}:
		if len(v) == 0 {
			return "(empty array)"
		}
		var sb strings.Builder
		for i, item := range v {
			if i > 0 {
				sb.WriteString("\n")
			}
			prefix := fmt.Sprintf("%s%d) ", indent, i+1)
			sb.WriteString(prefix)
			sb.WriteString(formatRedisReply(item, indent+"   "))
		}
		return sb.String()
	case map[interface{}]interface{}:
		if len(v) == 0 {
			return "(empty map)"
		}
		var lines []string
		idx := 1
		for mk, mv := range v {
			lines = append(lines, fmt.Sprintf("%s%d) %q => %s", indent, idx, fmt.Sprintf("%v", mk), formatRedisReply(mv, indent+"   ")))
			idx++
		}
		return strings.Join(lines, "\n")
	default:
		return fmt.Sprintf("%v", v)
	}
}
