package redisclient

// RedisKeySummary represents a lightweight key entry in Key Explorer
type RedisKeySummary struct {
	Key  string `json:"key"`
	Type string `json:"type"`
}

// RedisScanResult represents a paginated cursor-based SCAN response
type RedisScanResult struct {
	Keys         []RedisKeySummary `json:"keys"`
	NextCursor   uint64            `json:"nextCursor"`
	TotalKeys    int64             `json:"totalKeys"`
	ScannedCount int64             `json:"scannedCount"`
	HasMore      bool              `json:"hasMore"`
}

// RedisHashField represents a single field-value pair in a Redis Hash
type RedisHashField struct {
	Field string `json:"field"`
	Value string `json:"value"`
}

// RedisListItem represents an indexed item in a Redis List
type RedisListItem struct {
	Index int64  `json:"index"`
	Value string `json:"value"`
}

// RedisZSetMember represents a scored member in a Redis Sorted Set
type RedisZSetMember struct {
	Member string  `json:"member"`
	Score  float64 `json:"score"`
}

// RedisKeyDetail represents the complete inspected state and value of a Redis key
type RedisKeyDetail struct {
	Key         string            `json:"key"`
	Type        string            `json:"type"`
	TTL         int64             `json:"ttl"` // -1 = no expiry, -2 = missing, >= 0 = seconds
	SizeBytes   int64             `json:"sizeBytes"`
	Length      int64             `json:"length"`
	Exists      bool              `json:"exists"`
	StringValue string            `json:"stringValue"`
	HashFields  []RedisHashField  `json:"hashFields"`
	ListItems   []RedisListItem   `json:"listItems"`
	SetMembers  []string          `json:"setMembers"`
	ZSetMembers []RedisZSetMember `json:"zSetMembers"`
}

// RedisSetKeyRequest represents payload to create a new Redis key of any supported data type
type RedisSetKeyRequest struct {
	Key         string            `json:"key"`
	Type        string            `json:"type"` // string, hash, list, set, zset
	TTL         int64             `json:"ttl"`  // <= 0 for no expiry
	StringValue string            `json:"stringValue"`
	HashFields  []RedisHashField  `json:"hashFields"`
	ListValues  []string          `json:"listValues"`
	SetMembers  []string          `json:"setMembers"`
	ZSetMembers []RedisZSetMember `json:"zSetMembers"`
}

// RedisCommandResult represents the formatted output of a raw Redis CLI command
type RedisCommandResult struct {
	Command         string `json:"command"`
	Output          string `json:"output"`
	ExecutionTimeMs int64  `json:"executionTimeMs"`
	Error           string `json:"error,omitempty"`
}
