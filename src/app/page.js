"use client";

import { useState, useMemo } from "react";
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
  ChevronDown,
  Search
} from "lucide-react";
import { analyzeAttendance, analyzeAttendanceRange, getEmployeeIds } from "@/lib/attendance";
import { Parser } from "json2csv";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const formatDuration = (hours) => {
  if (typeof hours !== "number") return "--";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  // Handle case where rounding minutes makes it 60
  const finalH = m === 60 ? h + 1 : h;
  const finalM = m === 60 ? 0 : m;

  if (finalH === 0 && finalM === 0) return "0h 0m";
  if (finalH === 0) return `${finalM}m`;
  if (finalM === 0) return `${finalH}h`;
  return `${finalH}h ${finalM}m`;
};

const DEFAULT_EMPLOYEE_LIST = [
  "56", "109", "117", "162", "180", "184", "198", "227", "228", "230", "297", "402", "406", "414", "415", "434", "435", 
  "442", "443", "444", "446", "456", "457", "458", "459", "462", "463", "468", "469", "470", "472", "473", "477", "488", 
  "501", "505", "506", "507", "508", "509", "510", "511", "512", "513", "514", "515", "516", "517", "519", "520", "521", 
  "522", "523", "524", "525", "526", "527", "528", "529", "530", "535", "543", "546", "550", "551", "556", "560", "573", 
  "588", "600", "619", "643", "647", "662", "663", "666", "667", "668", "682", "683", "684", "685", "686", "687", "689", 
  "691", "697", "698", "699", "700", "701", "702", "703", "704", "705", "706", "735", "748", "754", "758", "760", "768", 
  "769", "773", "774", "779", "790", "791", "793"
];

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [fileText, setFileText] = useState("");
  const [activeTab, setActiveTab] = useState("analyzer"); // "analyzer" or "net-hours"
  const [employeeId, setEmployeeId] = useState(""); // Kept for backward compatibility/single input if needed
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1 + "");
  const [year, setYear] = useState(new Date().getFullYear() + "");
  const [results, setResults] = useState([]); // Changed from 'result' to 'results'
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState(""); // New state for filtering the attendance table
  const [selectedDayLogs, setSelectedDayLogs] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]); // Array of dates selected for export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const [viewEmployeeNetHours, setViewEmployeeNetHours] = useState(null);
  const [bulkPasteInput, setBulkPasteInput] = useState("");
  const [singleIdInput, setSingleIdInput] = useState("");

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError("");

      try {
        const text = await selectedFile.text();
        setFileText(text);
        const ids = getEmployeeIds(text);
        setAvailableEmployees(ids);
        
        // Find default employees that are actually available in the uploaded file
        const defaultSelected = DEFAULT_EMPLOYEE_LIST.filter(id => ids.includes(id));
        setSelectedEmployees(defaultSelected);
        setBulkPasteInput(defaultSelected.join("\n"));
      } catch (err) {
        setError("Error reading file.");
      }
    }
  };

  const toggleEmployeeSelection = (id) => {
    setSelectedEmployees(prev => {
      const next = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];
      setBulkPasteInput(next.join("\n"));
      return next;
    });
  };

  const selectAllEmployees = () => {
    if (selectedEmployees.length === availableEmployees.length) {
      setSelectedEmployees([]);
      setBulkPasteInput("");
    } else {
      setSelectedEmployees([...availableEmployees]);
      setBulkPasteInput(availableEmployees.join("\n"));
    }
  };

  const handleClearList = () => {
    setSelectedEmployees([]);
    setBulkPasteInput("");
  };

  const handleAddSingleId = () => {
    const trimmed = singleIdInput.trim();
    if (trimmed === "") return;

    if (!availableEmployees.includes(trimmed)) {
      alert(`Employee ID ${trimmed} is not found in the uploaded file.`);
      return;
    }

    setSelectedEmployees(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      setBulkPasteInput(next.join("\n"));
      return next;
    });
    setSingleIdInput("");
  };

  const handleBulkIdPaste = (val) => {
    setBulkPasteInput(val);
    if (val.trim() === "") {
      setSelectedEmployees([]);
      return;
    }
    const parsedIds = val.replace(/,/g, ' ')
      .split(/\s+/)
      .map(id => id.trim())
      .filter(id => id !== "");
    
    const validIds = parsedIds.filter(id => availableEmployees.includes(id));
    setSelectedEmployees(validIds);
  };

  const downloadSingleEmployeeNetHoursExcel = (empId) => {
    if (!fileText) return;

    try {
      const m = parseInt(month);
      const y = parseInt(year);
      const dateObj = new Date(y, m - 1, 1);
      const allExpectedDates = [];
      while (dateObj.getMonth() === m - 1) {
        allExpectedDates.push(`${y}-${String(m).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`);
        dateObj.setDate(dateObj.getDate() + 1);
      }

      const report = analyzeAttendance(fileText, empId, month, year);

      const sheetData = allExpectedDates.map(dateStr => {
        const dailyRecord = report.dailyRecords.find(r => r.date === dateStr);
        return {
          "Date": dateStr,
          "Day": new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }),
          "Employee ID": empId,
          "Net Hours": dailyRecord ? (dailyRecord.netHours || 0) : 0
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, `Net Hours - ${empId}`);

      const fileName = `Net_Hours_Employee_${empId}_${month}_${year}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("Single employee Excel export failed", err);
    }
  };

  const processData = async () => {
    if (!file) {
      setError("Please upload an attendance log file.");
      return;
    }
    if (selectedEmployees.length === 0) {
      setError("Please select at least one Employee ID.");
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      const text = fileText || await file.text();
      if (!fileText) setFileText(text);
      const allResults = selectedEmployees.map(id =>
        analyzeAttendance(text, id, month, year)
      ).filter(res => res.dailyRecords.length > 0);

      if (allResults.length === 0) {
        setError("No records found for selected employees in the given period.");
        setResults([]);
      } else {
        setResults(allResults);
        setActiveResultIndex(0);
      }
      setIsProcessing(false);
    } catch (err) {
      setError("Error processing file.");
      setIsProcessing(false);
    }
  };

  const exportSummaries = useMemo(() => {
    if (!fileText || selectedEmployees.length === 0) return [];
    return selectedEmployees.map(id => {
      const report = analyzeAttendance(fileText, id, month, year);
      const totalNetHours = report.dailyRecords.reduce((sum, r) => sum + (r.netHours || 0), 0);
      const totalHours = report.dailyRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
      const presentDays = report.summary.totalDaysWithRecords;
      const totalDays = report.summary.totalDays;
      const absentDays = report.summary.totalAbsentDays;
      return {
        employeeId: id,
        totalDays,
        presentDays,
        absentDays,
        totalHours: parseFloat(totalHours.toFixed(2)),
        totalNetHours,
        formattedNetHours: formatDuration(totalNetHours)
      };
    });
  }, [fileText, selectedEmployees, month, year]);

  const downloadBulkNetHoursExcel = () => {
    if (selectedEmployees.length === 0 || !fileText) return;

    try {
      const m = parseInt(month);
      const y = parseInt(year);
      const dateObj = new Date(y, m - 1, 1);
      const allExpectedDates = [];
      while (dateObj.getMonth() === m - 1) {
        allExpectedDates.push(`${y}-${String(m).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`);
        dateObj.setDate(dateObj.getDate() + 1);
      }

      const employeeReports = selectedEmployees.map(id => ({
        id,
        report: analyzeAttendance(fileText, id, month, year)
      }));

      // Sheet 1: Net Hours Grid (rows are dates, columns are employee IDs)
      const gridData = allExpectedDates.map(dateStr => {
        const row = {
          "Date": dateStr,
          "Day": new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" })
        };
        employeeReports.forEach(emp => {
          const dailyRecord = emp.report.dailyRecords.find(r => r.date === dateStr);
          row[`ID: ${emp.id}`] = dailyRecord ? (dailyRecord.netHours || 0) : 0;
        });
        return row;
      });

      // Sheet 2: Net Hours Flat List
      const listData = [];
      allExpectedDates.forEach(dateStr => {
        const dayStr = new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
        employeeReports.forEach(emp => {
          const dailyRecord = emp.report.dailyRecords.find(r => r.date === dateStr);
          listData.push({
            "Date": dateStr,
            "Day": dayStr,
            "Employee ID": emp.id,
            "Net Hours": dailyRecord ? (dailyRecord.netHours || 0) : 0
          });
        });
      });

      const wb = XLSX.utils.book_new();
      
      const wsGrid = XLSX.utils.json_to_sheet(gridData);
      XLSX.utils.book_append_sheet(wb, wsGrid, "Net Hours Grid");

      const wsList = XLSX.utils.json_to_sheet(listData);
      XLSX.utils.book_append_sheet(wb, wsList, "Net Hours List");

      const fileName = `Bulk_Net_Hours_${month}_${year}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("Excel Export failed", err);
    }
  };

  const downloadCSV = () => {
    if (results.length === 0) return;
    const currentResult = results[activeResultIndex];

    try {
      const data = getExportData();
      const csvData = data.map(r => ({
        employeeId: r["Employee ID"],
        date: r["Date"],
        day: r["Day"],
        inTime: r["IN Time"],
        outTime: r["OUT Time"],
        totalHours: r["Hours"],
        netHours: r["Net Hours"],
        scanCount: r["Scans"],
        status: r["Status"]
      }));

      const parser = new Parser({
        fields: ["employeeId", "date", "day", "inTime", "outTime", "totalHours", "netHours", "scanCount", "status"]
      });
      const csv = parser.parse(csvData);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Attendance_${currentResult.employeeId}_${month}_${year}.csv`);
      link.click();
    } catch (err) {
      console.error("CSV Export failed", err);
    }
  };

  const downloadAllAsZip = async () => {
    if (results.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder(`Attendance_Reports_${month}_${year}`);

    results.forEach(res => {
      const records = res.dailyRecords;
      const data = records.map(r => ({
        employeeId: res.employeeId,
        date: r.date,
        inTime: r.inTime,
        outTime: r.outTime,
        totalHours: formatDuration(r.totalHours),
        netHours: formatDuration(r.netHours),
        scanCount: r.scanCount,
        status: r.status
      }));

      const parser = new Parser({
        fields: ["employeeId", "date", "inTime", "outTime", "totalHours", "netHours", "scanCount", "status"]
      });
      const csv = parser.parse(data);
      folder.file(`Attendance_${res.employeeId}_${month}_${year}.csv`, csv);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Reports_${month}_${year}.zip`);
    link.click();
  };

  const toggleRowSelection = (date) => {
    setSelectedRows(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const selectAllRows = () => {
    const currentResult = results[activeResultIndex];
    if (!currentResult) return;
    const allDates = currentResult.dailyRecords.map(r => r.date);
    if (selectedRows.length === allDates.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(allDates);
    }
  };

  const result = results[activeResultIndex];

  const filteredDailyRecords = result?.dailyRecords.filter(row => {
    if (!tableFilter) return true;
    const dateObj = new Date(row.date);
    const dayLong = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    const query = tableFilter.toLowerCase();
    return row.date.includes(query) || dayLong.includes(query) || dayShort.includes(query);
  }) || [];

  const getExportData = () => {
    const currentResult = results[activeResultIndex];
    if (!currentResult) return [];

    // Prioritize selected rows, then filtered rows, then all records
    let recordsToExport = [];
    if (selectedRows.length > 0) {
      recordsToExport = currentResult.dailyRecords.filter(r => selectedRows.includes(r.date));
    } else if (tableFilter) {
      recordsToExport = filteredDailyRecords;
    } else {
      recordsToExport = currentResult.dailyRecords;
    }

    return recordsToExport.map(r => ({
      "Employee ID": currentResult.employeeId,
      "Date": r.date,
      "Day": new Date(r.date).toLocaleDateString("en-US", { weekday: "short" }),
      "IN Time": r.inTime,
      "OUT Time": r.outTime,
      "Scans": r.scanCount,
      "Hours": formatDuration(r.totalHours),
      "Net Hours": formatDuration(r.netHours),
      "Status": r.status
    }));
  };

  const getExportAllData = () => {
    let combinedExport = [];

    results.forEach(res => {
      // Apply similar tableFilter if you desired, otherwise export all original records for the selected workers.
      let recordsToExport = res.dailyRecords;
      if (selectedRows.length > 0) {
        recordsToExport = res.dailyRecords.filter(r => selectedRows.includes(r.date));
      } else if (tableFilter) {
        recordsToExport = res.dailyRecords.filter(row => {
          const dateObj = new Date(row.date);
          const dayLong = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
          const dayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
          const query = tableFilter.toLowerCase();
          return row.date.includes(query) || dayLong.includes(query) || dayShort.includes(query);
        });
      }

      const rows = recordsToExport.map(r => ({
        "Employee ID": res.employeeId,
        "Date": r.date,
        "Day": new Date(r.date).toLocaleDateString("en-US", { weekday: "short" }),
        "IN Time": r.inTime,
        "OUT Time": r.outTime,
        "Scans": r.scanCount,
        "Hours": formatDuration(r.totalHours),
        "Net Hours": formatDuration(r.netHours),
        "Status": r.status
      }));

      combinedExport = combinedExport.concat(rows);
    });

    return combinedExport;
  };

  const downloadExcel = () => {
    const data = getExportAllData(); // Now exports all processed results
    if (data.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance_All");

    // Output naming includes "All" since multiple users might exist
    const fileName = results.length > 1 ? `Attendance_Multiple_Users_${month}_${year}.xlsx` : `Attendance_${results[0].employeeId}_${month}_${year}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const downloadPDF = () => {
    const data = getExportData();
    if (data.length === 0) return;

    const currentResult = results[activeResultIndex];
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(`Attendance Report - Employee ${currentResult.employeeId}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Period: ${new Date(0, parseInt(month) - 1).toLocaleString('default', { month: 'long' })} ${year}`, 14, 30);

    const tableColumn = Object.keys(data[0]);
    const tableRows = data.map(item => Object.values(item));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] } // Indigo-600 color
    });

    doc.save(`Attendance_${currentResult.employeeId}_${month}_${year}.pdf`);
  };

  const handleRangeExport = async () => {
    if (!file || !exportStartDate || !exportEndDate) return;

    try {
      const text = fileText || await file.text();
      if (!fileText) setFileText(text);
      const currentResult = results[activeResultIndex];
      const rangeResult = analyzeAttendanceRange(text, currentResult.employeeId, exportStartDate, exportEndDate);

      if (rangeResult.dailyRecords.length === 0) {
        alert("No records found for this date range.");
        return;
      }

      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text(`Attendance Report - Employee ${currentResult.employeeId}`, 14, 22);
      doc.setFontSize(11);
      doc.text(`Period: ${exportStartDate} to ${exportEndDate}`, 14, 30);

      const tableColumn = ["Date", "IN Time", "OUT Time", "Scans", "Scan Log"];
      const formatTime12h = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      const tableRows = rangeResult.dailyRecords.map(r => {
        let inDisplay = r.inTime;
        if (r.inDateTime) {
          inDisplay = formatTime12h(r.inDateTime);
        }

        let outDisplay = r.outTime;
        if (r.outDateTime) {
          const d = r.outDateTime;
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          outDisplay = `${dateStr} ${formatTime12h(d)}`;
        }

        const processedLogs = r.logs.map((log, i, arr) => {
          const [timeNum, period] = log.displayTime.split(' ');
          const nextLog = arr[i + 1];
          const nextPeriod = nextLog ? nextLog.displayTime.split(' ')[1] : null;

          return {
            ...log,
            printTime: (nextPeriod === period) ? timeNum : log.displayTime
          };
        });

        return [
          r.date,
          inDisplay,
          outDisplay,
          r.scanCount,
          { content: processedLogs.map(l => l.printTime).join(', '), logs: processedLogs }
        ];
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        didParseCell: function (data) {
          if (data.section === 'body') {
            if (data.column.index === 1) { // IN Time column
              data.cell.styles.textColor = [0, 128, 0]; // Green
            }
            if (data.column.index === 2) { // OUT Time column
              data.cell.styles.textColor = [255, 255, 255]; // Hide for custom draw
            }
            if (data.column.index === 4) { // Scan Log column
              data.cell.styles.textColor = [255, 255, 255]; // Hide default text
            }
          }
        },
        didDrawCell: function (data) {
          if (data.section === 'body' && data.column.index === 2) {
            const text = String(data.cell.raw);
            const x = data.cell.x + 2;
            const y = data.cell.y + (data.cell.height / 1.5);

            if (text && text.includes(' ')) {
              const firstSpace = text.indexOf(' ');
              const datePart = text.substring(0, firstSpace);
              const timePart = text.substring(firstSpace + 1);

              doc.setTextColor(0, 0, 0); // Black Date
              doc.text(datePart, x, y);

              const dw = doc.getTextWidth(datePart);
              doc.setTextColor(255, 0, 0); // Red Time
              doc.text(timePart, x + dw + 1, y);
            } else {
              doc.setTextColor(255, 0, 0); // Red
              doc.text(text, x, y);
            }
          }

          if (data.section === 'body' && data.column.index === 4) {
            const logs = data.cell.raw.logs;
            if (!logs) return;

            const x = data.cell.x;
            const y = data.cell.y;

            // Approximate padding if available or hardcode
            let currentX = x + 2;
            let currentY = y + (data.cell.height / 1.5);

            logs.forEach((log, index) => {
              // Set color
              if (log.type === 'IN') doc.setTextColor(0, 128, 0); // Green
              else doc.setTextColor(255, 0, 0); // Red

              doc.text(log.printTime, currentX, currentY);
              currentX += doc.getTextWidth(log.printTime);

              // Draw separator if not last
              if (index < logs.length - 1) {
                doc.setTextColor(0, 0, 0); // Black for comma
                doc.text(', ', currentX, currentY);
                currentX += doc.getTextWidth(', ');
              }
            });
          }
        }
      });

      doc.save(`Attendance_${currentResult.employeeId}_${exportStartDate}_to_${exportEndDate}.pdf`);
      setShowExportModal(false);
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to generate report.");
    }
  };


  return (
    <main className="min-h-screen gradient-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-[1400px] mx-auto space-y-8">

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

        {/* Tab switcher */}
        <div className="flex justify-center">
          <div className="bg-glass border border-glass-border p-1 rounded-2xl flex gap-1 shadow-lg backdrop-blur-md">
            <button
              onClick={() => setActiveTab("analyzer")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === "analyzer"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-900/20"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              Detailed Analyzer
            </button>
            <button
              onClick={() => setActiveTab("net-hours")}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === "net-hours"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-900/20"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
            >
              <Download className="w-4 h-4" />
              Bulk Net Hours Exporter
            </button>
          </div>
        </div>

        {activeTab === "analyzer" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

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

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <User className="w-4 h-4" /> Employee IDs
                    </label>
                    {availableEmployees.length > 0 && (
                      <button
                        onClick={selectAllEmployees}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
                      >
                        {selectedEmployees.length === availableEmployees.length ? "Deselect All" : "Select All"}
                      </button>
                    )}
                  </div>

                  {availableEmployees.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search ID..."
                        className="w-full bg-glass border border-glass-border rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="bg-glass border border-glass-border rounded-xl p-3 max-h-80 overflow-y-auto custom-scrollbar">
                    {availableEmployees.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {availableEmployees
                          .filter(id => id.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map(id => (
                            <label key={id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                              <input
                                type="checkbox"
                                className="accent-indigo-500 w-4 h-4 rounded border-glass-border bg-glass"
                                checked={selectedEmployees.includes(id)}
                                onChange={() => toggleEmployeeSelection(id)}
                              />
                              <span className="text-sm font-mono group-hover:text-indigo-400 transition-colors">ID: {id}</span>
                            </label>
                          ))}
                        {availableEmployees.filter(id => id.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                          <div className="col-span-2 py-4 text-center">
                            <p className="text-xs text-muted-foreground italic">No IDs match your search</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground italic">Upload a file to see IDs</p>
                      </div>
                    )}
                  </div>
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
          <div className="lg:col-span-3 space-y-6">
            <AnimatePresence mode="wait">
              {results.length === 0 ? (
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
                    {availableEmployees.length > 0
                      ? "Select employee IDs above and click 'Generate Report'."
                      : "Upload the log file to see available employees and generate reports."}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* Multi-result selector */}
                  {results.length > 1 && (
                    <div className="flex flex-wrap gap-2 pb-2">
                      {results.map((res, idx) => (
                        <button
                          key={res.employeeId}
                          onClick={() => setActiveResultIndex(idx)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                            activeResultIndex === idx
                              ? "bg-indigo-500 text-white border-indigo-400"
                              : "bg-glass border-glass-border text-muted-foreground hover:bg-white/10"
                          )}
                        >
                          Employee {res.employeeId}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <SummaryCard
                      title="Total Days"
                      value={tableFilter ? filteredDailyRecords.length : result.summary.totalDays}
                      icon={<Calendar className="w-5 h-5 text-blue-400" />}
                    />
                    <SummaryCard
                      title="Present Days"
                      value={tableFilter ? filteredDailyRecords.filter(r => r.status !== "ABSENT").length : result.summary.totalDaysWithRecords}
                      icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                    />
                    <SummaryCard
                      title="Absent Days"
                      value={tableFilter ? filteredDailyRecords.filter(r => r.status === "ABSENT").length : result.summary.totalAbsentDays}
                      icon={<AlertCircle className="w-5 h-5 text-gray-400" />}
                    />
                    <SummaryCard
                      title="Missing OUT"
                      value={tableFilter ? filteredDailyRecords.filter(r => r.status === "OUT MISSING").length : result.summary.totalOutMissingDays}
                      icon={<AlertCircle className="w-5 h-5 text-red-400" />}
                      highlight={(tableFilter ? filteredDailyRecords.filter(r => r.status === "OUT MISSING").length : result.summary.totalOutMissingDays) > 0}
                    />
                  </div>

                  <div className="glass-morphism rounded-3xl overflow-hidden">
                    <div className="p-6 border-b border-glass-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full sm:w-auto">
                        <h3 className="text-xl font-semibold whitespace-nowrap">Daily Attendance Log</h3>
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Filter by day (e.g. Mon) or date..."
                            className="w-full bg-glass border border-glass-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {results.length > 0 && (
                          <button
                            onClick={() => setShowExportModal(true)}
                            className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-4 py-2 rounded-xl transition-colors text-sm font-medium border border-blue-500/20"
                          >
                            <Calendar className="w-4 h-4" />
                            Export Range
                          </button>
                        )}
                        {results.length > 1 && (
                          <button
                            onClick={downloadAllAsZip}
                            className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-4 py-2 rounded-xl transition-colors text-sm font-medium border border-purple-500/20"
                          >
                            <Download className="w-4 h-4" />
                            Download All (ZIP)
                          </button>
                        )}
                        <button
                          onClick={downloadExcel}
                          className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl transition-colors text-sm font-medium border border-emerald-500/20"
                        >
                          <Download className="w-4 h-4" />
                          Excel
                        </button>
                        <button
                          onClick={downloadPDF}
                          className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-4 py-2 rounded-xl transition-colors text-sm font-medium border border-rose-500/20"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>

                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-muted-foreground text-[10px] uppercase tracking-wider">
                            <th className="px-4 py-4 font-semibold text-center w-10">
                              <input
                                type="checkbox"
                                className="accent-indigo-500 w-3.5 h-3.5 rounded border-glass-border bg-glass"
                                checked={filteredDailyRecords.length > 0 && filteredDailyRecords.every(r => selectedRows.includes(r.date))}
                                onChange={() => {
                                  const allFilteredDates = filteredDailyRecords.map(r => r.date);
                                  const areAllSelected = filteredDailyRecords.every(r => selectedRows.includes(r.date));
                                  if (areAllSelected) {
                                    setSelectedRows(prev => prev.filter(d => !allFilteredDates.includes(d)));
                                  } else {
                                    setSelectedRows(prev => [...new Set([...prev, ...allFilteredDates])]);
                                  }
                                }}
                              />
                            </th>
                            <th className="px-6 py-4 font-semibold">Date</th>
                            <th className="px-6 py-4 font-semibold">IN Time</th>
                            <th className="px-6 py-4 font-semibold">OUT Time</th>
                            <th className="px-6 py-4 font-semibold text-center">Scans</th>
                            <th className="px-6 py-4 font-semibold text-center">Hours</th>
                            <th className="px-6 py-4 font-semibold text-center">Net Hours</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-glass-border">
                          {filteredDailyRecords.map((row, idx) => (
                            <motion.tr
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              key={row.date}
                              className={cn(
                                "hover:bg-white/5 transition-colors group",
                                selectedRows.includes(row.date) && "bg-indigo-500/5"
                              )}
                            >
                              <td className="px-4 py-4 text-center">
                                <input
                                  type="checkbox"
                                  className="accent-indigo-500 w-3.5 h-3.5 rounded border-glass-border bg-glass"
                                  checked={selectedRows.includes(row.date)}
                                  onChange={() => toggleRowSelection(row.date)}
                                />
                              </td>
                              <td className="px-6 py-4 font-medium">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter leading-none mb-1">
                                    {new Date(row.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                  </span>
                                  <span className="text-sm">{row.date}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-emerald-400 font-mono text-sm">{row.inTime}</td>
                              <td className="px-6 py-4 text-amber-400 font-mono text-sm">
                                <div className="flex items-center gap-1.5">
                                  {row.outTime}
                                  {row.isNextDayOut && (
                                    <span title="Clocked out next day" className="text-xs">🌙</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={() => setSelectedDayLogs({ date: row.date, logs: row.logs })}
                                  className="bg-white/10 hover:bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-lg text-xs font-bold transition-all border border-white/5 hover:border-indigo-500/30"
                                >
                                  {row.scanCount}
                                </button>
                              </td>
                              <td className="px-6 py-4 font-semibold text-center text-sm">
                                {typeof row.totalHours === 'number' ? formatDuration(row.totalHours) : '--'}
                              </td>
                              <td className="px-6 py-4 font-semibold text-center text-sm">
                                {typeof row.netHours === 'number' ? formatDuration(row.netHours) : '--'}
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
        )}

        {activeTab === "net-hours" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="grid grid-cols-1 lg:grid-cols-4 gap-8"
          >
            {/* Controls Panel */}
            <div className="lg:col-span-1 space-y-6">
              <div className="glass-morphism rounded-3xl p-6 space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Filter className="w-5 h-5 text-indigo-400" />
                  Export Parameters
                </h2>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground font-semibold">Log File</label>
                    {file ? (
                      <div className="bg-glass border border-glass-border rounded-2xl p-4 flex items-center gap-3">
                        <FileText className="w-8 h-8 text-indigo-400" />
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {availableEmployees.length} employees loaded
                          </p>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-glass-border rounded-2xl cursor-pointer hover:bg-glass transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Click to upload data.dat
                          </p>
                        </div>
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                      </label>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 font-semibold">
                        <User className="w-4 h-4" /> Employee IDs
                      </label>
                      {availableEmployees.length > 0 && (
                        <button
                          onClick={selectAllEmployees}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
                        >
                          {selectedEmployees.length === availableEmployees.length ? "Deselect All" : "Select All"}
                        </button>
                      )}
                    </div>

                    {availableEmployees.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {/* Paste Area & Clear Button */}
                        <div className="space-y-1">
                          <textarea
                            rows={3}
                            placeholder="Paste ID List (separated by lines or commas)..."
                            className="w-full bg-glass border border-glass-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono resize-none custom-scrollbar"
                            value={bulkPasteInput}
                            onChange={(e) => handleBulkIdPaste(e.target.value)}
                          />
                          {selectedEmployees.length > 0 && (
                            <div className="flex justify-end mt-1">
                              <button
                                onClick={handleClearList}
                                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/25 transition-all"
                              >
                                Clear List
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Add Another Emp No */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Add Another Emp No</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Type ID to add..."
                              className="flex-1 bg-glass border border-glass-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono"
                              value={singleIdInput}
                              onChange={(e) => setSingleIdInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddSingleId();
                                }
                              }}
                            />
                            <button
                              onClick={handleAddSingleId}
                              className="bg-indigo-600/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/35 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Search ID filter */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search ID..."
                            className="w-full bg-glass border border-glass-border rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="bg-glass border border-glass-border rounded-xl p-3 max-h-80 overflow-y-auto custom-scrollbar">
                      {availableEmployees.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {availableEmployees
                            .filter(id => id.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(id => (
                              <label key={id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                                <input
                                  type="checkbox"
                                  className="accent-indigo-500 w-4 h-4 rounded border-glass-border bg-glass"
                                  checked={selectedEmployees.includes(id)}
                                  onChange={() => toggleEmployeeSelection(id)}
                                />
                                <span className="text-sm font-mono group-hover:text-indigo-400 transition-colors">ID: {id}</span>
                              </label>
                            ))}
                          {availableEmployees.filter(id => id.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                            <div className="col-span-2 py-4 text-center">
                              <p className="text-xs text-muted-foreground italic">No IDs match your search</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-xs text-muted-foreground italic">Upload a file to see IDs</p>
                        </div>
                      )}
                    </div>
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
                </div>
              </div>
            </div>

            {/* Results/Preview Area */}
            <div className="lg:col-span-3 space-y-6">
              {exportSummaries.length === 0 ? (
                <div className="h-full min-h-[400px] glass-morphism rounded-3xl flex flex-col items-center justify-center text-center p-8 border-dashed border-2">
                  <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-xl font-medium text-muted-foreground">Select Employees</h3>
                  <p className="text-sm text-muted-foreground/60 max-w-sm mt-2">
                    {availableEmployees.length > 0
                      ? "Select employee IDs on the left to preview their net hours."
                      : "Please upload the attendance file to begin."}
                  </p>
                </div>
              ) : (
                <div className="glass-morphism rounded-3xl overflow-hidden">
                  <div className="p-6 border-b border-glass-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5">
                    <div>
                      <h3 className="text-xl font-semibold">Net Hours Export Summary</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Previewing {exportSummaries.length} employee(s) for {new Date(0, parseInt(month) - 1).toLocaleString('default', { month: 'long' })} {year}
                      </p>
                    </div>
                    <button
                      onClick={downloadBulkNetHoursExcel}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-5 py-3 rounded-xl shadow-lg transition-all text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-muted-foreground text-[10px] uppercase tracking-wider">
                          <th className="px-6 py-4 font-semibold">Employee ID</th>
                          <th className="px-6 py-4 font-semibold text-center">Total Days</th>
                          <th className="px-6 py-4 font-semibold text-center">Net Hours</th>
                          <th className="px-6 py-4 font-semibold text-center">Net Hours (Formatted)</th>
                          <th className="px-6 py-4 font-semibold text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-glass-border">
                        {exportSummaries.map((row, idx) => (
                          <motion.tr
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            key={row.employeeId}
                            className="hover:bg-white/5 transition-colors group"
                          >
                            <td className="px-6 py-4 font-medium text-sm">
                              ID: {row.employeeId}
                            </td>
                            <td className="px-6 py-4 text-center font-mono text-sm">{row.totalDays}</td>
                            <td className="px-6 py-4 text-center text-indigo-400 font-mono text-sm font-bold">{row.totalNetHours}h</td>
                            <td className="px-6 py-4 text-center text-purple-400 font-mono text-sm font-bold">{row.formattedNetHours}</td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => {
                                    try {
                                      const report = analyzeAttendance(fileText, row.employeeId, month, year);
                                      setViewEmployeeNetHours({
                                        employeeId: row.employeeId,
                                        dailyRecords: report.dailyRecords
                                      });
                                    } catch (err) {
                                      console.error("View employee details failed", err);
                                    }
                                  }}
                                  className="bg-white/10 hover:bg-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-white/5 hover:border-indigo-500/30 flex items-center gap-1.5"
                                  title="View daily net hours breakdown"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  View
                                </button>
                                <button
                                  onClick={() => downloadSingleEmployeeNetHoursExcel(row.employeeId)}
                                  className="bg-white/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-white/5 hover:border-emerald-500/30 flex items-center gap-1.5"
                                  title="Download employee Excel sheet"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download Excel
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {selectedDayLogs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-morphism rounded-3xl p-8 max-w-sm w-full border border-glass-border shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Scan Details</h3>
                  <p className="text-sm text-muted-foreground">{selectedDayLogs.date}</p>
                </div>
                <button
                  onClick={() => setSelectedDayLogs(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {selectedDayLogs.logs.map((log, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-2xl border border-glass-border/50">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          log.type === "IN" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-amber-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]"
                        )} />
                        <span className="font-mono text-lg font-medium tracking-tight">{log.displayTime}</span>
                        <div className="flex gap-1.5">
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-md",
                            log.type === "IN" ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400 bg-amber-400/10"
                          )}>
                            {log.type}
                          </span>
                          {log.isDuplicate && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase tracking-tighter">
                              Double Tap
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-5 font-mono">
                        {log.displayDate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setSelectedDayLogs(null)}
                className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-morphism rounded-3xl p-8 max-w-sm w-full border border-glass-border shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Export Range</h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                  <input
                    type="date"
                    className="w-full bg-glass border border-glass-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">End Date</label>
                  <input
                    type="date"
                    className="w-full bg-glass border border-glass-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                  />
                </div>
              </div>

              <button
                onClick={handleRangeExport}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download PDF
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewEmployeeNetHours && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-morphism rounded-3xl p-8 max-w-lg w-full border border-glass-border shadow-2xl flex flex-col max-h-[85vh] space-y-4"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">Daily Net Hours</h3>
                  <p className="text-sm text-muted-foreground">
                    Employee ID: {viewEmployeeNetHours.employeeId} ({new Date(0, parseInt(month) - 1).toLocaleString('default', { month: 'long' })} {year})
                  </p>
                </div>
                <button
                  onClick={() => setViewEmployeeNetHours(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 border border-glass-border/40 rounded-2xl bg-black/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0 backdrop-blur-md">
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Day</th>
                      <th className="px-4 py-3 font-semibold text-center">Net Hours</th>
                      <th className="px-4 py-3 font-semibold text-center">Formatted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/30 font-mono text-sm">
                    {viewEmployeeNetHours.dailyRecords.map((row) => (
                      <tr key={row.date} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2.5 text-white">{row.date}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(row.date).toLocaleDateString("en-US", { weekday: "short" })}
                        </td>
                        <td className="px-4 py-2.5 text-center text-indigo-400 font-bold">{row.netHours}h</td>
                        <td className="px-4 py-2.5 text-center text-purple-400 font-bold">{formatDuration(row.netHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  onClick={() => {
                    downloadSingleEmployeeNetHoursExcel(viewEmployeeNetHours.employeeId);
                  }}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Excel
                </button>
                <button
                  onClick={() => setViewEmployeeNetHours(null)}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main >
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
    "NO IN RECORD": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "ABSENT": "bg-gray-500/10 text-gray-400 border-gray-500/20"
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
