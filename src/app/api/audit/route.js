import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { rawLogs, dailyRecords, employeeId, month, year } = body;

    if (!employeeId || !month || !year || !dailyRecords) {
      return NextResponse.json(
        { error: "Missing required parameters: employeeId, month, year, or dailyRecords" },
        { status: 400 }
      );
    }

    // If you do not want to use .env.local or frontend settings, paste your Gemini API Key directly below:
    const INBUILT_GEMINI_KEY = "AIzaSyDbFF8aBHFq0Ec9Ee7puffw_KhgWmaeeBA"; 

    const apiKey = request.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY || INBUILT_GEMINI_KEY;
    if (!apiKey || apiKey.trim() === "") {
      return NextResponse.json(
        { error: "Gemini API key is not configured. Please add it in settings, server-side environment variables, or route.js." },
        { status: 400 }
      );
    }

    const promptText = `
You are an AI Auditor for a biometric attendance tracking system.
Your job is to:
1. Verify if the computed daily records match the raw log data and the specified logic rules.
2. Identify discrepancies between raw log data + rules and the calculated results.
3. Identify practical anomalies or suspicious patterns in the attendance itself.
4. Classify the employee's work schedule category based on their monthly attendance patterns.
5. Create a corrected version of the daily records by resolving logging errors (such as incorrect scan types or missing check-in/check-out taps).

**WORKER SCHEDULE CATEGORIES**:
1. Office Workers: Standard office hours (e.g., 7:00 AM or 8:00 AM to 5:00 PM). If they work more than these hours, they might earn overtime (OT).
2. Shift Workers: Rotating shift schedules, typically 12-hour shifts. E.g., 3 days Day Shift (7:00 AM to 7:00 PM), 3 days Night Shift (7:00 PM to 7:00 AM next day), and 3 days Off.
3. Unknown: If the pattern does not fit either of the above.

**BUSINESS LOGIC RULES**:
1. Double Tap Detection:
   If two consecutive scans of the same worker have the same scan type (IN and IN, or OUT and OUT) AND occur within less than 1 hour (60 minutes), the second scan is flagged as a duplicate (isDuplicate: true) and ignored for session pairing and hours calculations.
2. Session Pairing:
   - Scans are processed chronologically.
   - 0 means IN, 1 means OUT.
   - An IN scan followed by an OUT scan forms a NORMAL session. The total hours are computed as the duration between IN and OUT.
   - If an IN scan is followed by another IN scan (before any OUT), the first IN scan has no OUT. It is closed as a session with status "OUT MISSING" and assigned a default of 8.0 hours. The second IN becomes the new open session.
   - If an OUT scan occurs without any preceding open IN scan, it is an orphan OUT. It is moved to the PREVIOUS day, closed as a session with status "NO IN RECORD", and assigned a default of 8.0 hours.
   - Any open IN scan remaining at the end of the log is closed as "OUT MISSING" with 8.0 hours.
3. Daily Calculations:
   - For any date, its sessions are grouped.
   - totalHours for a day is the sum of the durations of all sessions assigned to that day (actual hours for NORMAL sessions, or 8.0 hours for default sessions like OUT MISSING or NO IN RECORD).
   - netHours is Math.max(0, Math.round(totalHours) - 1) (deducting 1 hour for lunch from the rounded total hours).
   - Status definition:
     - NORMAL: if there is at least one session on that day, and all sessions are NORMAL.
     - OUT MISSING: if any session on that day has OUT MISSING status.
     - NO IN RECORD: if any session on that day has NO IN RECORD status (unless overridden by OUT MISSING).
     - ABSENT: if no sessions on that day.

**LOGGING ERROR CORRECTIONS (AI CORRECTIONS)**:
Biometric fingerprint machines can record incorrect scan directions or be missed entirely. Detect and correct these mistakes:
- **Incorrect Scan Status (Machine switch error)**: If a worker has two check-ins (e.g. 7:05 AM check-in status 0 and 6:00 PM check-in status 0) because they forgot to switch the machine status, recognize that the second scan was meant to be a check-out (status 1). Correct the scan status to OUT and recalculate the day as a single NORMAL session (e.g., 7:05 AM to 6:00 PM) instead of two "OUT MISSING" sessions.
- **Missing Check-In or Check-Out**: If a check-in or check-out is missing but it is clear the employee worked (based on their typical schedule pattern), infer and estimate the missing tap time (e.g. inferring a 5:00 PM check-out for a standard office worker who checked in at 7:45 AM but has no check-out, or inferring a 7:00 PM check-out for a shift worker who checked in at 7:00 AM). Update the status to "NORMAL" and recalculate hours.
- If you perform a correction for a day, flag it as corrected and explain what was changed.

**INPUT DATA**:
- Employee ID: ${employeeId}
- Period: ${month}/${year}
- Raw logs for this employee (each line format: ID Date Time VerifyMode InOutStatus, where InOutStatus 0=IN, 1=OUT):
${rawLogs || "(No raw logs provided)"}

- Calculated daily records:
${JSON.stringify(dailyRecords, null, 2)}

**YOUR TASK**:
1. Analyze raw logs and classify the employee's work schedule category (Office Worker, Shift Worker, or Unknown).
2. Compare the raw logs step-by-step with the calculated daily records according to the business logic rules to find discrepancies or anomalies.
3. Generate a corrected version of the daily records. For each day, if you detect a scan status error or missing tap, correct the times, totalHours, netHours, and status, and set isCorrected=true. If no changes are needed, copy the calculated daily record values with isCorrected=false.

Provide the output in JSON format. The output MUST be valid JSON only, matching this schema:
{
  "hasIssue": true/false, // true if there are discrepancies or high-severity anomalies
  "summary": "Overall summary of the audit",
  "employeeCategory": "Office Worker (7/8 AM - 5 PM)" | "Shift Worker (3 Days Day Shift, 3 Days Night Shift, 3 Days Off)" | "Unknown",
  "discrepancies": [
    {
      "date": "YYYY-MM-DD",
      "severity": "high" | "medium",
      "description": "Description of the calculation error/mismatch"
    }
  ],
  "anomalies": [
    {
      "date": "YYYY-MM-DD",
      "severity": "medium" | "low",
      "description": "Description of the anomaly"
    }
  ],
  "correctedRecords": [
    {
      "date": "YYYY-MM-DD",
      "inTime": "HH:MM", // corrected or original in time (e.g. "07:05" or "-")
      "outTime": "HH:MM", // corrected or original out time (e.g. "18:00" or "-")
      "totalHours": 10.92, // corrected or original totalHours (float)
      "netHours": 10.0, // corrected or original netHours (float)
      "status": "NORMAL" | "OUT MISSING" | "NO IN RECORD" | "ABSENT", // corrected or original status
      "isCorrected": true/false, // true if AI modified any value for this date
      "correctedFields": ["inTime" | "outTime" | "totalHours" | "netHours" | "status"], // array of fields that were corrected
      "explanation": "Description of the correction made (e.g. Corrected 6:00 PM IN scan to OUT as it is the end of the shift)" // empty string if not corrected
    }
  ]
}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error Response:", errorText);
      return NextResponse.json(
        { error: `Gemini API returned status ${response.status}: ${errorText}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return NextResponse.json(
        { error: "Empty response from Gemini API" },
        { status: 500 }
      );
    }

    try {
      const auditResult = JSON.parse(resultText.trim());
      return NextResponse.json(auditResult);
    } catch (parseError) {
      console.error("JSON Parse Error for Gemini response:", resultText);
      return NextResponse.json(
        { error: "Invalid JSON response returned by AI model", rawResponse: resultText },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API Audit Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during audit processing" },
      { status: 500 }
    );
  }
}
