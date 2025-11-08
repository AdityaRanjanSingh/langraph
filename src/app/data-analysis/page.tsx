import { DataAnalysisThread } from "@/components/DataAnalysisThread";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Analysis Agent",
  description: "AI-powered data analysis assistant with statistical tools and visualizations",
};

export default function DataAnalysisPage() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-2xl font-bold">Data Analysis Agent</h1>
        <p className="text-sm text-gray-600">
          Analyze data with statistical tools, calculations, and chart generation
        </p>
      </header>
      <main className="flex-1 overflow-hidden">
        <DataAnalysisThread />
      </main>
    </div>
  );
}
