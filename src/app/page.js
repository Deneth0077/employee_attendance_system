"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Download,
  User,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Filter,
  BarChart3,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { analyzeAttendance } from "@/lib/attendance";
import { Parser } from "json2csv";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1 + "");
  const [year, setYear] = useState(new Date().getFullYear() + "");
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError("");
    }
  };

  const processData = async () => {
    if (!file) {
      setError("Please upload an attendance log file.");
      return;
    }
    if (!employeeId) {
      setError("Please enter an Employee ID.");
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      const text = await file.text();
      const analysisResult = analyzeAttendance(text, employeeId, month, year);

      // Simulate slight delay for "processing" feel
      setTimeout(() => {
        setResult(analysisResult);
        setIsProcessing(false);
      }, 800);
    } catch (err) {
      setError("Error processing file. Please ensure it's a valid biometric log.");
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (!result) return;

    try {
      const records = result.dailyRecords;
      const data = records.map(r => ({
        employeeId: result.employeeId,
        date: r.date,
        inTime: r.inTime,
        outTime: r.outTime,
        totalHours: r.totalHours,
        scanCount: r.scanCount,
        status: r.status
      }));

      const parser = new Parser({
        fields: ["employeeId", "date", "inTime", "outTime", "totalHours", "scanCount", "status"]
      });
      const csv = parser.parse(data);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Attendance_${employeeId}_${month}_${year}.csv`);
      link.click();
    } catch (err) {
      console.error("CSV Export failed", err);
    }
  };

  return (
    <main className="min-h-screen gradient-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl gradient-text"
          >
            Attendance Pro
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            Intelligent Biometric Log Analyzer & Reporting System
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Controls Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1 space-y-6"
          >
            <div className="glass-morphism rounded-3xl p-6 space-y-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Filter className="w-5 h-5 text-indigo-400" />
                Parameters
              </h2>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Log File</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-glass-border rounded-2xl cursor-pointer hover:bg-glass transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        {file ? file.name : "Click to upload data.dat"}
                      </p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <User className="w-4 h-4" /> Employee ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 101"
                    className="w-full bg-glass border border-glass-border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Month
                    </label>
                    <select
                      className="w-full bg-glass border border-glass-border rounded-xl px-4 py-2 focus:outline-none"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1} className="bg-[#0f0f0f]">
                          {new Date(0, i).toLocaleString('default', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Year
                    </label>
                    <input
                      type="number"
                      className="w-full bg-glass border border-glass-border rounded-xl px-4 py-2 focus:outline-none"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </div>
                )}

                <button
                  onClick={processData}
                  disabled={isProcessing}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <>
                      <BarChart3 className="w-5 h-5" />
                      Generate Report
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Results Area */}
          <div className="lg:col-span-2 space-y-6">
            <AnimatePresence mode="wait">
              {!result ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[400px] glass-morphism rounded-3xl flex flex-col items-center justify-center text-center p-8 border-dashed border-2"
                >
                  <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-xl font-medium text-muted-foreground">Ready to process</h3>
                  <p className="text-sm text-muted-foreground/60 max-w-sm mt-2">
                    Enter employee details and upload the log file to see the analysis here.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <SummaryCard
                      title="Total Days"
                      value={result.summary.totalDaysWithRecords}
                      icon={<Calendar className="w-5 h-5 text-blue-400" />}
                    />
                    <SummaryCard
                      title="Normal Days"
                      value={result.summary.totalNormalDays}
                      icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
                    />
                    <SummaryCard
                      title="Missing OUT"
                      value={result.summary.totalOutMissingDays}
                      icon={<AlertCircle className="w-5 h-5 text-red-400" />}
                      highlight={result.summary.totalOutMissingDays > 0}
                    />
                  </div>

                  {/* Daily Records Table */}
                  <div className="glass-morphism rounded-3xl overflow-hidden">
                    <div className="p-6 border-b border-glass-border flex justify-between items-center bg-white/5">
                      <h3 className="text-xl font-semibold">Daily Attendance Log</h3>
                      <button
                        onClick={downloadCSV}
                        className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
                      >
                        <Download className="w-4 h-4" />
                        Download CSV
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="px-6 py-4 font-semibold">Date</th>
                            <th className="px-6 py-4 font-semibold">IN Time</th>
                            <th className="px-6 py-4 font-semibold">OUT Time</th>
                            <th className="px-6 py-4 font-semibold">Hours</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-glass-border">
                          {result.dailyRecords.map((row, idx) => (
                            <motion.tr
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              key={row.date}
                              className="hover:bg-white/5 transition-colors"
                            >
                              <td className="px-6 py-4 font-medium">{row.date}</td>
                              <td className="px-6 py-4 text-emerald-400 font-mono">{row.inTime}</td>
                              <td className="px-6 py-4 text-orange-400 font-mono">{row.outTime}</td>
                              <td className="px-6 py-4 font-semibold">
                                {typeof row.totalHours === 'number' ? `${row.totalHours}h` : '--'}
                              </td>
                              <td className="px-6 py-4">
                                <StatusBadge status={row.status} />
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ title, value, icon, highlight }) {
  return (
    <div className={cn(
      "glass-morphism rounded-2xl p-4 flex items-center justify-between",
      highlight && "border-red-500/30 bg-red-500/5"
    )}>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </div>
      <div className="p-3 bg-white/5 rounded-xl">
        {icon}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    "NORMAL": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "OUT MISSING": "bg-red-500/10 text-red-400 border-red-500/20",
    "NO IN RECORD": "bg-amber-500/10 text-amber-400 border-amber-500/20"
  };

  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
      styles[status] || "bg-gray-500/10 text-gray-400 border-gray-500/20"
    )}>
      {status}
    </span>
  );
}
