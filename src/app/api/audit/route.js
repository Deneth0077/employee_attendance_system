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

**INPUT DATA**:
- Employee ID: ${employeeId}
- Period: ${month}/${year}
- Raw logs for this employee (each line format: ID Date Time VerifyMode InOutStatus, where InOutStatus 0=IN, 1=OUT):
${rawLogs || "(No raw logs provided)"}

- Calculated daily records:
${JSON.stringify(dailyRecords, null, 2)}

**YOUR TASK**:
Analyze the raw logs and compare them step-by-step with the calculated daily records according to the business logic rules.
Identify:
1. **Discrepancies**: Any calculation error in the calculated daily records (e.g. incorrect status, wrong hours, missed duplicate taps, wrong net hours).
2. **Anomalies**: Any strange attendance patterns (e.g. extremely long shifts > 16 hours, check-ins at unusual hours like 3 AM, or multiple entries/exits in one day).

Provide the output in JSON format. The output MUST be valid JSON only, matching this schema:
{
  "hasIssue": true/false, // true if there are discrepancies or high-severity anomalies
  "summary": "Overall summary of the audit",
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
