import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Calculator tool for mathematical expressions
 */
const calculatorSchema = z.object({
  input: z.string().describe("Mathematical expression to evaluate"),
});

export const calculatorTool = tool(
  async (input) => {
    try {
      // Safety: Only allow Math functions and basic arithmetic
      const sanitized = (input as z.infer<typeof calculatorSchema>).input.trim();

      // Validate that input only contains safe characters
      if (!/^[0-9+\-*/(). ,Math.a-z]+$/i.test(sanitized)) {
        return "Error: Invalid characters in expression. Only numbers, operators, and Math functions are allowed.";
      }

      // Evaluate the expression
      // Note: In production, consider using a safer math parser like math.js
      const result = Function('"use strict"; return (' + sanitized + ")")();

      if (typeof result !== "number" || !isFinite(result)) {
        return "Error: Expression did not evaluate to a valid number.";
      }

      return `Result: ${result}`;
    } catch (error) {
      return `Error evaluating expression: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "calculator",
    description:
      "Evaluates mathematical expressions. Supports basic arithmetic (+, -, *, /), exponentiation (**), and common Math functions (sqrt, abs, sin, cos, tan, log, exp, etc.). Example: '2 + 2', 'Math.sqrt(16)', 'Math.pow(2, 3)'",
    schema: calculatorSchema,
  }
);

/**
 * Statistics tool for calculating common statistical measures
 */
const statisticsSchema = z.object({
  data: z.array(z.number()).describe("Array of numbers for analysis"),
  operation: z
    .enum([
      "mean",
      "median",
      "mode",
      "stddev",
      "variance",
      "min",
      "max",
      "sum",
      "count",
      "all",
    ])
    .describe("Statistical operation to perform"),
});

export const statisticsTool = tool(
  async (input) => {
    try {
      const { data, operation } = input as z.infer<typeof statisticsSchema>;

      if (!Array.isArray(data) || data.length === 0) {
        return "Error: Data must be a non-empty array of numbers.";
      }

      const numbers = data.map(Number).filter((n) => !isNaN(n));
      if (numbers.length === 0) {
        return "Error: No valid numbers found in data.";
      }

      const sorted = [...numbers].sort((a, b) => a - b);

      const stats = {
        count: numbers.length,
        sum: numbers.reduce((a, b) => a + b, 0),
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        mean: 0,
        median: 0,
        mode: [] as number[],
        variance: 0,
        stddev: 0,
      };

      stats.mean = stats.sum / stats.count;

      // Median
      const mid = Math.floor(stats.count / 2);
      stats.median =
        stats.count % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      // Mode
      const frequency = new Map<number, number>();
      numbers.forEach((n) => frequency.set(n, (frequency.get(n) || 0) + 1));
      const maxFreq = Math.max(...frequency.values());
      stats.mode = Array.from(frequency.entries())
        .filter(([, freq]) => freq === maxFreq)
        .map(([num]) => num);

      // Variance and Standard Deviation
      stats.variance =
        numbers.reduce((acc, n) => acc + Math.pow(n - stats.mean, 2), 0) /
        stats.count;
      stats.stddev = Math.sqrt(stats.variance);

      // Return requested operation
      const operations: Record<string, string | number | number[]> = {
        mean: stats.mean,
        median: stats.median,
        mode: stats.mode.join(", "),
        stddev: stats.stddev,
        variance: stats.variance,
        min: stats.min,
        max: stats.max,
        sum: stats.sum,
        count: stats.count,
        all: JSON.stringify(stats, null, 2),
      };

      if (operation in operations) {
        return `${operation}: ${operations[operation]}`;
      } else {
        return `Error: Unknown operation '${operation}'. Valid operations: mean, median, mode, stddev, variance, min, max, sum, count, all`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : "Unknown error"}. Expected format: {"data": [1,2,3], "operation": "mean"}`;
    }
  },
  {
    name: "statistics",
    description:
      "Calculates statistical measures for a dataset. Provide a comma-separated list of numbers and specify the operation: 'mean', 'median', 'mode', 'stddev', 'variance', 'min', 'max', 'sum', 'count', or 'all' for all statistics.",
    schema: statisticsSchema,
  }
);

/**
 * Data transformation tool for sorting, filtering, and aggregating data
 */
const dataTransformSchema = z.object({
  data: z.array(z.any()).describe("Array to transform"),
  operation: z
    .enum(["sort", "filter", "unique", "slice", "reverse"])
    .describe("Transformation operation"),
  params: z
    .record(z.string(), z.any())
    .optional()
    .describe("Operation-specific parameters"),
});

export const dataTransformTool = tool(
  async (input) => {
    try {
      const { data, operation, params } = input as z.infer<
        typeof dataTransformSchema
      >;

      if (!Array.isArray(data)) {
        return "Error: Data must be an array.";
      }

      let result = [...data];

      switch (operation) {
        case "sort":
          const order = params?.order || "asc";
          result.sort((a, b) => {
            if (typeof a === "number" && typeof b === "number") {
              return order === "asc" ? a - b : b - a;
            }
            return order === "asc"
              ? String(a).localeCompare(String(b))
              : String(b).localeCompare(String(a));
          });
          break;

        case "filter":
          const { operator, value } = params || {};
          if (!operator || value === undefined) {
            return "Error: Filter requires 'operator' (gt/lt/eq/gte/lte) and 'value' in params.";
          }
          result = result.filter((item) => {
            const num = Number(item);
            const val = Number(value);
            switch (operator) {
              case "gt":
                return num > val;
              case "lt":
                return num < val;
              case "eq":
                return num === val;
              case "gte":
                return num >= val;
              case "lte":
                return num <= val;
              default:
                return true;
            }
          });
          break;

        case "unique":
          result = Array.from(new Set(result));
          break;

        case "slice":
          const start = (params?.start as number) || 0;
          const end = params?.end as number | undefined;
          result = result.slice(start, end);
          break;

        case "reverse":
          result.reverse();
          break;

        default:
          return `Error: Unknown operation '${operation}'. Valid operations: sort, filter, unique, slice, reverse`;
      }

      return JSON.stringify({
        operation,
        inputLength: data.length,
        outputLength: result.length,
        result,
      });
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : "Unknown error"}. Expected format: {"data": [1,2,3], "operation": "sort", "params": {"order": "asc"}}`;
    }
  },
  {
    name: "data_transform",
    description:
      "Transforms data arrays. Operations: 'sort' (asc/desc), 'filter' (gt/lt/eq with value), 'unique' (remove duplicates), 'slice' (start, end), 'reverse'. Provide data and operation details as JSON.",
    schema: dataTransformSchema,
  }
);

/**
 * Chart specification generator tool
 */
const chartSpecSchema = z.object({
  data: z.array(z.number()).describe("Array of numbers to visualize"),
  labels: z
    .array(z.string())
    .optional()
    .describe("Labels for data points"),
  chartType: z
    .enum(["bar", "line", "pie", "scatter"])
    .describe("Type of chart"),
  title: z.string().optional().describe("Chart title"),
  xLabel: z.string().optional().describe("X-axis label"),
  yLabel: z.string().optional().describe("Y-axis label"),
});

export const chartSpecTool = tool(
  async (input) => {
    try {
      const { data, labels, chartType, title, xLabel, yLabel } =
        input as z.infer<typeof chartSpecSchema>;

      if (!Array.isArray(data) || data.length === 0) {
        return "Error: Data must be a non-empty array.";
      }

      const validTypes = ["bar", "line", "pie", "scatter"];
      if (!validTypes.includes(chartType)) {
        return `Error: Invalid chart type '${chartType}'. Valid types: ${validTypes.join(", ")}`;
      }

      const spec = {
        type: chartType,
        data: {
          labels: labels || data.map((_, i) => `Item ${i + 1}`),
          datasets: [
            {
              label: title || "Dataset",
              data,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: !!title,
              text: title || "",
            },
            legend: {
              display: chartType === "pie",
            },
          },
          scales:
            chartType !== "pie"
              ? {
                  x: {
                    title: {
                      display: !!xLabel,
                      text: xLabel || "",
                    },
                  },
                  y: {
                    title: {
                      display: !!yLabel,
                      text: yLabel || "",
                    },
                  },
                }
              : undefined,
        },
      };

      return JSON.stringify(spec, null, 2);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : "Unknown error"}. Expected format: {"data": [1,2,3], "labels": ["A","B","C"], "chartType": "bar", "title": "My Chart"}`;
    }
  },
  {
    name: "chart_spec_generator",
    description:
      "Generates a chart specification (JSON) for visualizing data. Supports chart types: 'bar', 'line', 'pie', 'scatter'. Provide data, labels, chart type, and optional title/axis labels.",
    schema: chartSpecSchema,
  }
);

/**
 * All data analysis tools
 */
export const dataAnalysisTools = [
  calculatorTool,
  statisticsTool,
  dataTransformTool,
  chartSpecTool,
];
