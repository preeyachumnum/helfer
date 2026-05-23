import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "slip_upload_disabled",
      message: "ปิดการอ่านสลิปอัตโนมัติแล้ว กรุณาใช้เมนูกรอกเอง"
    },
    { status: 410 }
  );
}
