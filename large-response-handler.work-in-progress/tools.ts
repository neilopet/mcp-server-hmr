import { z } from "zod";

// Tool argument schemas
export const AnalyzeWithDuckDBArgsSchema = z.object({
  query: z.string().describe("SQL query to execute on the dataset"),
  dataset_name: z.string().describe("Name of the persisted dataset to query"),
});

export const ListSavedDatasetsArgsSchema = z.object({});

// Type definitions
export type AnalyzeWithDuckDBArgs = z.infer<typeof AnalyzeWithDuckDBArgsSchema>;
export type ListSavedDatasetsArgs = z.infer<typeof ListSavedDatasetsArgsSchema>;

// Response type definitions
export interface AnalyzeWithDuckDBResponse {
  results: any[];
  row_count: number;
  columns: string[];
  query: string;
  dataset_name: string;
}

export interface ListSavedDatasetsResponse {
  datasets: Array<{
    name: string;
    created_at: string;
    size_bytes: number;
    row_count?: number;
    columns?: string[];
  }>;
}

// Tool definitions
export const LRH_TOOLS = [
  {
    name: "mcpmon.analyze-with-duckdb",
    description: "Execute SQL queries on persisted datasets using DuckDB. Supports standard SQL operations including SELECT, JOIN, GROUP BY, etc.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "SQL query to execute on the dataset",
        },
        dataset_name: {
          type: "string",
          description: "Name of the persisted dataset to query",
        },
      },
      required: ["query", "dataset_name"],
    },
  },
  {
    name: "mcpmon.list-saved-datasets",
    description: "List all available persisted datasets that can be queried with DuckDB",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
] as const;

// Type for tool names
export type LRHToolName = typeof LRH_TOOLS[number]["name"];