/**
 * Extracts unique Employee IDs from the biometric attendance log data.
 * @param {string} fileText 
 * @returns {string[]} Sorted unique employee IDs
 */
export function getEmployeeIds(fileText) {
  const lines = fileText.trim().split('\n');
  const ids = new Set();

  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length > 0 && parts[0]) {
      ids.add(parts[0]);
    }
  });

  return Array.from(ids).sort((a, b) => {
    // Attempt numerical sort if possible, otherwise string sort
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}

/**
 * Analyzes biometric attendance log data and generates a structured report.
 * 
 * Data Format: EmployeeID Date Time VerifyMode InOutStatus WorkCode Reserved
 * Column meanings:
 * - EmployeeID: Worker ID
 * - Date: Attendance date (YYYY-MM-DD)
 * - Time: Scan time (HH:MM:SS)
 * - InOutStatus: 0 means IN, 1 means OUT
 */
export function analyzeAttendance(fileText, employeeId, month, year) {
  const lines = fileText.trim().split('\n');
  const records = [];

  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) return;

    const [id, date, time, verifyMode, inOutStatus] = parts;
    const [logYear, logMonth] = date.split('-').map(Number);

    // Apply Filters: Employee ID, Month, Year
    if (id === employeeId && logMonth === parseInt(month) && logYear === parseInt(year)) {
      records.push({
        id,
        date,
        time,
        inOutStatus: parseInt(inOutStatus)
      });
    }
  });

  // Group records by Date
  const groupedByDate = records.reduce((acc, rec) => {
    if (!acc[rec.date]) acc[rec.date] = [];
    acc[rec.date].push(rec);
    return acc;
  }, {});

  const dailyRecords = [];
  let totalOutMissingDays = 0;
  let totalNormalDays = 0;

  const sortedDates = Object.keys(groupedByDate).sort();

  sortedDates.forEach(date => {
    const dayRecords = groupedByDate[date];
    const inScans = dayRecords.filter(r => r.inOutStatus === 0).sort((a, b) => a.time.localeCompare(b.time));
    const outScans = dayRecords.filter(r => r.inOutStatus === 1).sort((a, b) => a.time.localeCompare(b.time));

    const allDayLogs = dayRecords.map(r => ({
      time: r.time.substring(0, 5),
      type: r.inOutStatus === 0 ? "IN" : "OUT"
    })).sort((a, b) => a.time.localeCompare(b.time));

    const scanCount = dayRecords.length;
    let inTimeStr = "-";
    let outTimeStr = "-";
    let totalHours = 0;
    let status = "NO RECORD";

    if (inScans.length > 0 && outScans.length > 0) {
      const earliestIn = inScans[0].time;
      const latestOut = outScans[outScans.length - 1].time;
      inTimeStr = earliestIn.substring(0, 5);
      outTimeStr = latestOut.substring(0, 5);

      const diffMs = new Date(`${date}T${latestOut}`) - new Date(`${date}T${earliestIn}`);
      totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
      status = "NORMAL";
      totalNormalDays++;
    } else if (inScans.length > 0) {
      inTimeStr = inScans[0].time.substring(0, 5);
      totalHours = 8; // Requirement: One scan only = 8 hours
      status = "OUT MISSING";
      totalOutMissingDays++;
    } else if (outScans.length > 0) {
      outTimeStr = outScans[outScans.length - 1].time.substring(0, 5);
      totalHours = 8; // Requirement: One scan only = 8 hours
      status = "NO IN RECORD";
    }

    dailyRecords.push({
      date,
      inTime: inTimeStr,
      outTime: outTimeStr,
      totalHours,
      scanCount,
      status,
      logs: allDayLogs
    });
  });

  return {
    employeeId,
    month,
    year,
    summary: {
      totalDaysWithRecords: dailyRecords.length,
      totalOutMissingDays,
      totalNormalDays
    },
    dailyRecords
  };
}
