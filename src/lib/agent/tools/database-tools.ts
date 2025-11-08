import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { Prisma } from "@prisma/client";

/**
 * Tool to get the complete database schema from PostgreSQL information_schema
 */
const getDatabaseSchemaSchema = z.object({
  includeSystemTables: z
    .boolean()
    .optional()
    .describe(
      "Whether to include system/internal tables (default: false, only shows user tables)"
    ),
});

export const getDatabaseSchemaTool = tool(
  async (input) => {
    const { includeSystemTables = false } =
      input as z.infer<typeof getDatabaseSchemaSchema>;

    try {
      // Query to get all tables with their columns, types, and constraints
      const query = Prisma.sql`
        SELECT
          t.table_name,
          json_agg(
            json_build_object(
              'column_name', c.column_name,
              'data_type', c.data_type,
              'is_nullable', c.is_nullable,
              'column_default', c.column_default,
              'character_maximum_length', c.character_maximum_length
            ) ORDER BY c.ordinal_position
          ) as columns
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c
          ON t.table_name = c.table_name
          AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public'
          ${includeSystemTables ? Prisma.empty : Prisma.sql`AND t.table_name NOT LIKE 'pg_%' AND t.table_name NOT LIKE '_prisma%'`}
        GROUP BY t.table_name
        ORDER BY t.table_name;
      `;

      const tables = await prisma.$queryRaw<
        Array<{
          table_name: string;
          columns: Array<{
            column_name: string;
            data_type: string;
            is_nullable: string;
            column_default: string | null;
            character_maximum_length: number | null;
          }>
        }>
      >(query);

      if (!tables || tables.length === 0) {
        return "No tables found in the database.";
      }

      // Format the schema as readable text
      let schemaText = "DATABASE SCHEMA\n";
      schemaText += "===============\n\n";

      for (const table of tables) {
        schemaText += `Table: ${table.table_name}\n`;
        schemaText += "-".repeat(table.table_name.length + 7) + "\n";

        if (table.columns && table.columns.length > 0) {
          for (const col of table.columns) {
            const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
            const type = col.character_maximum_length
              ? `${col.data_type}(${col.character_maximum_length})`
              : col.data_type;
            const defaultVal = col.column_default
              ? ` DEFAULT ${col.column_default}`
              : "";

            schemaText += `  - ${col.column_name}: ${type} ${nullable}${defaultVal}\n`;
          }
        }

        schemaText += "\n";
      }

      return schemaText;
    } catch (error) {
      return `Error fetching database schema: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "get_database_schema",
    description:
      "Retrieves the complete database schema including all tables, columns, data types, nullability, and default values. Use this to understand the database structure before writing queries.",
    schema: getDatabaseSchemaSchema,
  }
);

/**
 * Tool to list all tables in the database
 */
const listTablesSchema = z.object({
  includeSystemTables: z
    .boolean()
    .optional()
    .describe("Whether to include system/internal tables (default: false)"),
});

export const listTablesTool = tool(
  async (input) => {
    const { includeSystemTables = false } =
      input as z.infer<typeof listTablesSchema>;

    try {
      const query = Prisma.sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          ${includeSystemTables ? Prisma.empty : Prisma.sql`AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE '_prisma%'`}
        ORDER BY table_name;
      `;

      const tables = await prisma.$queryRaw<Array<{ table_name: string }>>(
        query
      );

      if (!tables || tables.length === 0) {
        return "No tables found in the database.";
      }

      const tableList = tables.map((t) => t.table_name).join(", ");
      return `Available tables (${tables.length}): ${tableList}`;
    } catch (error) {
      return `Error listing tables: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "list_tables",
    description:
      "Lists all table names in the database. Use this for a quick overview of available tables without full schema details.",
    schema: listTablesSchema,
  }
);

/**
 * Tool to get detailed schema for a specific table
 */
const getTableDetailsSchema = z.object({
  tableName: z.string().describe("The name of the table to get details for"),
});

export const getTableDetailsTool = tool(
  async (input) => {
    const { tableName } = input as z.infer<typeof getTableDetailsSchema>;

    try {
      // Get column information
      const columnsQuery = Prisma.sql`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default,
          ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
        ORDER BY ordinal_position;
      `;

      const columns = await prisma.$queryRaw<
        Array<{
          column_name: string;
          data_type: string;
          character_maximum_length: number | null;
          is_nullable: string;
          column_default: string | null;
          ordinal_position: number;
        }>
      >(columnsQuery);

      if (!columns || columns.length === 0) {
        return `Table '${tableName}' not found in the database.`;
      }

      // Get constraints (primary keys, foreign keys, etc.)
      const constraintsQuery = Prisma.sql`
        SELECT
          tc.constraint_type,
          kcu.column_name,
          tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = ${tableName}
        ORDER BY tc.constraint_type, kcu.column_name;
      `;

      const constraints = await prisma.$queryRaw<
        Array<{
          constraint_type: string;
          column_name: string;
          constraint_name: string;
        }>
      >(constraintsQuery);

      // Format output
      let details = `TABLE DETAILS: ${tableName}\n`;
      details += "=".repeat(tableName.length + 15) + "\n\n";

      details += "Columns:\n";
      for (const col of columns) {
        const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const type = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type;
        const defaultVal = col.column_default
          ? ` DEFAULT ${col.column_default}`
          : "";

        details += `  ${col.ordinal_position}. ${col.column_name}: ${type} ${nullable}${defaultVal}\n`;
      }

      if (constraints && constraints.length > 0) {
        details += "\nConstraints:\n";
        const grouped = constraints.reduce(
          (acc, c) => {
            if (!acc[c.constraint_type]) acc[c.constraint_type] = [];
            acc[c.constraint_type].push(c);
            return acc;
          },
          {} as Record<string, typeof constraints>
        );

        for (const [type, cons] of Object.entries(grouped)) {
          details += `  ${type}:\n`;
          for (const c of cons) {
            details += `    - ${c.column_name} (${c.constraint_name})\n`;
          }
        }
      }

      return details;
    } catch (error) {
      return `Error fetching table details: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "get_table_details",
    description:
      "Gets detailed schema information for a specific table including all columns, data types, constraints, primary keys, and foreign keys. Use this when you need in-depth information about a particular table.",
    schema: getTableDetailsSchema,
  }
);

/**
 * Tool to get sample data from a table
 */
const getSampleDataSchema = z.object({
  tableName: z.string().describe("The name of the table to get sample data from"),
  limit: z
    .number()
    .optional()
    .describe("Number of rows to return (default: 5, max: 20)"),
});

export const getSampleDataTool = tool(
  async (input) => {
    const { tableName, limit = 5 } = input as z.infer<
      typeof getSampleDataSchema
    >;

    // Enforce max limit for safety
    const safeLimit = Math.min(Math.max(1, limit), 20);

    try {
      // First verify the table exists
      const tableCheckQuery = Prisma.sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName};
      `;

      const tableExists = await prisma.$queryRaw<
        Array<{ table_name: string }>
      >(tableCheckQuery);

      if (!tableExists || tableExists.length === 0) {
        return `Table '${tableName}' not found in the database.`;
      }

      // Use Prisma raw query with proper SQL injection prevention
      // Note: Table names cannot be parameterized in Prisma, so we validate above
      const sampleQuery = Prisma.raw(
        `SELECT * FROM "${tableName}" LIMIT ${safeLimit};`
      );

      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(
        sampleQuery
      );

      if (!rows || rows.length === 0) {
        return `Table '${tableName}' exists but contains no data.`;
      }

      // Format as readable table
      let result = `SAMPLE DATA FROM: ${tableName} (${rows.length} rows)\n`;
      result += "=".repeat(tableName.length + 30) + "\n\n";

      // Get column names from first row
      const columns = Object.keys(rows[0]);

      // Format each row
      for (let i = 0; i < rows.length; i++) {
        result += `Row ${i + 1}:\n`;
        for (const col of columns) {
          const value = rows[i][col];
          const displayValue =
            value === null
              ? "NULL"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);
          result += `  ${col}: ${displayValue}\n`;
        }
        result += "\n";
      }

      return result;
    } catch (error) {
      return `Error fetching sample data: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "get_sample_data",
    description:
      "Fetches sample rows from a specified table to understand its data structure and content. Limited to 20 rows maximum for safety. Use this to see actual data examples.",
    schema: getSampleDataSchema,
  }
);

/**
 * Tool to execute SQL queries
 */
const executeSqlQuerySchema = z.object({
  query: z
    .string()
    .describe(
      "The SQL query to execute. Should be a SELECT query for safety. Use LIMIT to prevent large result sets."
    ),
});

export const executeSqlQueryTool = tool(
  async (input) => {
    const { query } = input as z.infer<typeof executeSqlQuerySchema>;

    try {
      // Basic validation - only allow SELECT queries for safety
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith("select")) {
        return "Error: Only SELECT queries are allowed for safety. Use SELECT to query data.";
      }

      // Check for dangerous patterns
      const dangerousPatterns = [
        "drop",
        "delete",
        "truncate",
        "insert",
        "update",
        "alter",
        "create",
        "grant",
        "revoke",
      ];
      for (const pattern of dangerousPatterns) {
        if (trimmedQuery.includes(pattern)) {
          return `Error: Query contains potentially dangerous operation '${pattern}'. Only SELECT queries are allowed.`;
        }
      }

      // Execute the query
      const result = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        query
      );

      if (!result || result.length === 0) {
        return "Query executed successfully but returned no rows.";
      }

      // Limit output size
      const maxRows = 50;
      const limitedResult = result.slice(0, maxRows);
      const truncated = result.length > maxRows;

      // Format results
      let output = `QUERY RESULTS (${result.length} rows${truncated ? `, showing first ${maxRows}` : ""})\n`;
      output += "=".repeat(50) + "\n\n";

      // Get column names
      const columns = Object.keys(limitedResult[0]);

      // Format each row
      for (let i = 0; i < limitedResult.length; i++) {
        output += `Row ${i + 1}:\n`;
        for (const col of columns) {
          const value = limitedResult[i][col];
          const displayValue =
            value === null
              ? "NULL"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);
          output += `  ${col}: ${displayValue}\n`;
        }
        output += "\n";
      }

      if (truncated) {
        output += `\n(Showing first ${maxRows} of ${result.length} rows. Use LIMIT in your query for better control.)\n`;
      }

      return output;
    } catch (error) {
      return `Error executing query: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "execute_sql_query",
    description:
      "Executes a SQL SELECT query against the database and returns the results. Only SELECT queries are allowed for safety. Use LIMIT to control result size. Maximum 50 rows will be displayed.",
    schema: executeSqlQuerySchema,
  }
);

/**
 * Export all database tools as an array for easy integration
 */
export const databaseTools = [
  getDatabaseSchemaTool,
  listTablesTool,
  getTableDetailsTool,
  getSampleDataTool,
  executeSqlQueryTool,
];
