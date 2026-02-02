import { analyzeAttendance } from "@/lib/attendance";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { fileText, employeeId, month, year } = await request.json();

        if (!fileText || !employeeId || !month || !year) {
            return NextResponse.json(
                { error: "Missing required parameters" },
                { status: 400 }
            );
        }

        const result = analyzeAttendance(fileText, employeeId, month, year);
        return NextResponse.json(result);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
