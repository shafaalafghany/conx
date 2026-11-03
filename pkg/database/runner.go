package database

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

// Runner manages multi-database connection testing, schema discovery, and query execution
type Runner struct{}

// NewRunner creates a new database query runner
func NewRunner() *Runner {
	return &Runner{}
}

// buildDSN constructs the connection string based on database type
func (r *Runner) buildDSN(conn DatabaseConnection, password string, overrideDb string) (driver string, dsn string, err error) {
	dbName := conn.DatabaseName
	if overrideDb != "" {
		dbName = overrideDb
	}

	switch strings.ToLower(conn.Type) {
	case "postgres", "postgresql":
		driver = "pgx"
		ssl := conn.SSLMode
		if ssl == "" {
			ssl = "disable"
		}
		if dbName == "" {
			dbName = "postgres"
		}
		dsn = fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
			conn.Username, password, conn.Host, conn.Port, dbName, ssl)
		return driver, dsn, nil

	case "mysql", "mariadb":
		driver = "mysql"
		port := conn.Port
		if port == 0 {
			port = 3306
		}
		if dbName != "" {
			dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?timeout=5s&parseTime=true",
				conn.Username, password, conn.Host, port, dbName)
		} else {
			dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/?timeout=5s&parseTime=true",
				conn.Username, password, conn.Host, port)
		}
		return driver, dsn, nil

	case "sqlite", "sqlite3":
		driver = "sqlite"
		dsn = conn.Host // In SQLite, host holds file path
		return driver, dsn, nil

	default:
		return "", "", fmt.Errorf("unsupported database driver: %s", conn.Type)
	}
}

// TestConnection attempts to ping the target database with a 5s timeout
func (r *Runner) TestConnection(conn DatabaseConnection, password string) error {
	driver, dsn, err := r.buildDSN(conn, password, "")
	if err != nil {
		return err
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return fmt.Errorf("failed to initialize driver: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}

	return nil
}

// GetDatabases returns all databases accessible on the server
func (r *Runner) GetDatabases(ctx context.Context, conn DatabaseConnection, password string) ([]string, error) {
	driver, dsn, err := r.buildDSN(conn, password, "")
	if err != nil {
		return nil, err
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	switch strings.ToLower(conn.Type) {
	case "mysql", "mariadb":
		rows, err := db.QueryContext(ctx, "SHOW DATABASES")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var dbs []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				dbs = append(dbs, name)
			}
		}
		return dbs, nil

	case "postgres", "postgresql":
		rows, err := db.QueryContext(ctx, "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var dbs []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				dbs = append(dbs, name)
			}
		}
		return dbs, nil

	case "sqlite", "sqlite3":
		if conn.DatabaseName != "" {
			return []string{conn.DatabaseName}, nil
		}
		return []string{"main"}, nil

	default:
		return nil, fmt.Errorf("unsupported database driver: %s", conn.Type)
	}
}

// GetTables returns table names within the specified database schema
func (r *Runner) GetTables(ctx context.Context, conn DatabaseConnection, password string, dbName string) ([]string, error) {
	driver, dsn, err := r.buildDSN(conn, password, dbName)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	switch strings.ToLower(conn.Type) {
	case "mysql", "mariadb":
		query := "SHOW TABLES"
		if dbName != "" {
			safeDb := strings.ReplaceAll(dbName, "`", "``")
			query = fmt.Sprintf("SHOW TABLES FROM `%s`", safeDb)
		}
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var tables []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				tables = append(tables, name)
			}
		}
		return tables, nil

	case "postgres", "postgresql":
		query := "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC"
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var tables []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				tables = append(tables, name)
			}
		}
		return tables, nil

	case "sqlite", "sqlite3":
		query := "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var tables []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				tables = append(tables, name)
			}
		}
		return tables, nil

	default:
		return nil, fmt.Errorf("unsupported database driver: %s", conn.Type)
	}
}

// GetTableStructure returns column specifications for a given table
func (r *Runner) GetTableStructure(ctx context.Context, conn DatabaseConnection, password string, dbName string, tableName string) ([]ColumnInfo, error) {
	driver, dsn, err := r.buildDSN(conn, password, dbName)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	switch strings.ToLower(conn.Type) {
	case "mysql", "mariadb":
		safeTable := strings.ReplaceAll(tableName, "`", "``")
		query := fmt.Sprintf("SHOW COLUMNS FROM `%s`", safeTable)
		if dbName != "" {
			safeDb := strings.ReplaceAll(dbName, "`", "``")
			query = fmt.Sprintf("SHOW COLUMNS FROM `%s` FROM `%s`", safeTable, safeDb)
		}
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var columns []ColumnInfo
		for rows.Next() {
			var field, colType, null, key string
			var defaultVal sql.NullString
			var extra string
			if err := rows.Scan(&field, &colType, &null, &key, &defaultVal, &extra); err == nil {
				columns = append(columns, ColumnInfo{
					Name:         field,
					Type:         colType,
					Nullable:     strings.ToUpper(null) == "YES",
					PrimaryKey:   strings.ToUpper(key) == "PRI",
					DefaultValue: defaultVal.String,
				})
			}
		}
		return columns, nil

	case "postgres", "postgresql":
		colQuery := `
			SELECT column_name, data_type, is_nullable, COALESCE(column_default, '')
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = $1
			ORDER BY ordinal_position
		`
		rows, err := db.QueryContext(ctx, colQuery, tableName)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		pkQuery := `
			SELECT kcu.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY'
				AND tc.table_schema = 'public'
				AND tc.table_name = $1
		`
		pkRows, err := db.QueryContext(ctx, pkQuery, tableName)
		pks := make(map[string]bool)
		if err == nil {
			defer pkRows.Close()
			for pkRows.Next() {
				var pkCol string
				if err := pkRows.Scan(&pkCol); err == nil {
					pks[pkCol] = true
				}
			}
		}

		var columns []ColumnInfo
		for rows.Next() {
			var name, dataType, isNullable, colDefault string
			if err := rows.Scan(&name, &dataType, &isNullable, &colDefault); err == nil {
				columns = append(columns, ColumnInfo{
					Name:         name,
					Type:         dataType,
					Nullable:     strings.ToUpper(isNullable) == "YES",
					PrimaryKey:   pks[name],
					DefaultValue: colDefault,
				})
			}
		}
		return columns, nil

	case "sqlite", "sqlite3":
		safeTable := strings.ReplaceAll(tableName, "'", "''")
		query := fmt.Sprintf("PRAGMA table_info('%s')", safeTable)
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var columns []ColumnInfo
		for rows.Next() {
			var cid int
			var name, colType string
			var notnull, pk int
			var dfltValue sql.NullString
			if err := rows.Scan(&cid, &name, &colType, &notnull, &dfltValue, &pk); err == nil {
				columns = append(columns, ColumnInfo{
					Name:         name,
					Type:         colType,
					Nullable:     notnull == 0,
					PrimaryKey:   pk > 0,
					DefaultValue: dfltValue.String,
				})
			}
		}
		return columns, nil

	default:
		return nil, fmt.Errorf("unsupported database driver: %s", conn.Type)
	}
}

// ExecuteQuery executes an arbitrary SQL statement and returns tabular rows or execution metrics
func (r *Runner) ExecuteQuery(ctx context.Context, conn DatabaseConnection, password string, overrideDb string, query string) (*QueryResult, error) {
	driver, dsn, err := r.buildDSN(conn, password, overrideDb)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}
	defer db.Close()

	trimmed := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(trimmed, "SELECT") ||
		strings.HasPrefix(trimmed, "SHOW") ||
		strings.HasPrefix(trimmed, "DESC") ||
		strings.HasPrefix(trimmed, "EXPLAIN") ||
		strings.HasPrefix(trimmed, "PRAGMA")

	start := time.Now()

	if isSelect {
		rows, err := db.QueryContext(ctx, query)
		elapsed := time.Since(start).Milliseconds()
		if err != nil {
			return &QueryResult{
				ExecutionTimeMs: elapsed,
				ExecutionMs:     elapsed,
				Error:           err.Error(),
			}, nil
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			return nil, err
		}

		const maxRows = 1000
		var resultRows []map[string]interface{}
		colCount := len(cols)
		totalCount := 0

		for rows.Next() {
			totalCount++
			if len(resultRows) < maxRows {
				scanArgs := make([]interface{}, colCount)
				values := make([]interface{}, colCount)
				for i := range values {
					scanArgs[i] = &values[i]
				}

				if err := rows.Scan(scanArgs...); err != nil {
					return nil, err
				}

				rowMap := make(map[string]interface{}, colCount)
				for i, col := range cols {
					switch val := values[i].(type) {
					case []byte:
						rowMap[col] = string(val)
					default:
						rowMap[col] = val
					}
				}
				resultRows = append(resultRows, rowMap)
			}
		}

		truncated := totalCount > maxRows
		elapsed = time.Since(start).Milliseconds()

		if resultRows == nil {
			resultRows = []map[string]interface{}{}
		}

		return &QueryResult{
			Columns:         cols,
			Rows:            resultRows,
			RowCount:        len(resultRows),
			TotalRows:       totalCount,
			Truncated:       truncated,
			AffectedRows:    int64(len(resultRows)),
			ExecutionTimeMs: elapsed,
			ExecutionMs:     elapsed,
		}, nil
	}

	// Non-select statement (INSERT, UPDATE, DELETE, DDL)
	res, err := db.ExecContext(ctx, query)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return &QueryResult{
			ExecutionTimeMs: elapsed,
			ExecutionMs:     elapsed,
			Error:           err.Error(),
		}, nil
	}

	affected, _ := res.RowsAffected()
	return &QueryResult{
		Columns:         []string{},
		Rows:            []map[string]interface{}{},
		RowCount:        0,
		AffectedRows:    affected,
		ExecutionTimeMs: elapsed,
		ExecutionMs:     elapsed,
	}, nil
}
