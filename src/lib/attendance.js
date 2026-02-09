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
  const allEmployeeRecords = [];

  // 1. Gather all records for the specific employee
  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) return;

    const [id, date, time, verifyMode, inOutStatus] = parts;
    if (id === employeeId) {
      allEmployeeRecords.push({
        id,
        date,
        time,
        dateTime: new Date(`${date}T${time}`),
        inOutStatus: parseInt(inOutStatus)
      });
    }
  });

  // 2. Sort records chronologically
  allEmployeeRecords.sort((a, b) => a.dateTime - b.dateTime);

  // 2.5 Identify Double Taps: Mark scans of same type within 1 hour as duplicate
  let lastValid = null;
  allEmployeeRecords.forEach(record => {
    if (!lastValid) {
      record.isDuplicate = false;
      lastValid = record;
    } else {
      const diffMs = record.dateTime - lastValid.dateTime;
      if (record.inOutStatus === lastValid.inOutStatus && diffMs < 60 * 60 * 1000) {
        record.isDuplicate = true;
      } else {
        record.isDuplicate = false;
        lastValid = record;
      }
    }
  });

  const uniqueRecords = allEmployeeRecords.filter(r => !r.isDuplicate);

  // 3. Pair INs and OUTs into sessions
  const sessions = [];
  let currentIn = null;

  uniqueRecords.forEach((record) => {
    if (record.inOutStatus === 0) { // IN
      if (currentIn) {
        // Previous IN had no OUT - treat as separate shift (forgot out)
        sessions.push({
          date: currentIn.date,
          in: currentIn,
          out: null,
          status: "OUT MISSING"
        });
      }
      currentIn = record;
    } else { // OUT
      if (currentIn) {
        // Found a matching OUT for the preceding IN
        sessions.push({
          date: currentIn.date, // Session is attributed to the IN date
          in: currentIn,
          out: record,
          status: "NORMAL"
        });
        currentIn = null;
      } else {
        // OUT without a preceding IN
        sessions.push({
          date: record.date,
          in: null,
          out: record,
          status: "NO IN RECORD"
        });
      }
    }
  });

  // Handle a lone IN record at the end of the log
  if (currentIn) {
    sessions.push({
      date: currentIn.date,
      in: currentIn,
      out: null,
      status: "OUT MISSING"
    });
  }

  // 4. Filter sessions by requested month and year (based on the session's reference date)
  const filteredSessions = sessions.filter(s => {
    const [sYear, sMonth] = s.date.split('-').map(Number);
    return sMonth === parseInt(month) && sYear === parseInt(year);
  });

  // 5. Group by Date for the daily report
  const dailyGroups = filteredSessions.reduce((acc, sess) => {
    if (!acc[sess.date]) acc[sess.date] = [];
    acc[sess.date].push(sess);
    return acc;
  }, {});

  const dailyRecords = [];
  let totalOutMissingDays = 0;
  let totalNormalDays = 0;

  const sortedDates = Object.keys(dailyGroups).sort();

  sortedDates.forEach(date => {
    const daySessions = dailyGroups[date];

    let totalDayHours = 0;
    let dayInTime = "-";
    let dayOutTime = "-";
    let dayStatus = "NORMAL";

    const formatTime = (dateObj) => {
      return dateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    // Find all original records for this specific DATE to show in logs
    const dayLogs = allEmployeeRecords.filter(r => r.date === date).map(r => ({
      time: r.time.substring(0, 5),
      displayTime: formatTime(r.dateTime),
      displayDate: r.date,
      dateTime: r.dateTime,
      type: r.inOutStatus === 0 ? "IN" : "OUT",
      isDuplicate: r.isDuplicate
    })).sort((a, b) => a.dateTime - b.dateTime);

    daySessions.forEach(sess => {
      if (sess.in) {
        if (dayInTime === "-") dayInTime = sess.in.time.substring(0, 5);
      }
      if (sess.out) {
        dayOutTime = sess.out.time.substring(0, 5);
      }

      if (sess.status === "NORMAL" && sess.in && sess.out) {
        const diffMs = sess.out.dateTime - sess.in.dateTime;
        totalDayHours += diffMs / (1000 * 60 * 60);
      } else {
        totalDayHours += 8;
        if (sess.status === "OUT MISSING") dayStatus = "OUT MISSING";
        if (sess.status === "NO IN RECORD" && dayStatus === "NORMAL") dayStatus = "NO IN RECORD";
      }
    });

    if (dayStatus === "NORMAL") totalNormalDays++;
    else if (dayStatus === "OUT MISSING") totalOutMissingDays++;

    dailyRecords.push({
      date,
      inTime: dayInTime,
      outTime: dayOutTime,
      totalHours: parseFloat(totalDayHours.toFixed(2)),
      scanCount: dayLogs.length, // Count all taps including duplicates
      status: dayStatus,
      logs: dayLogs
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
