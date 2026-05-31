// app/api/cron/sleep-reminders/route.ts
// Adaptive SleepFix email reminders.
// Called by cron-job.org using Authorization: Bearer <SLEEPFIX_CRON_SECRET>

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { buildAdaptiveReminderState, toLocalYMD } from "@/lib/rrsm/adaptive-reminder";

type NightRow = {
  created_at: string | null;
  local_date: string | null;
};

type AuthUser = {
  id: string;
  email?: string;
  created_at?: string;
};

type ReminderPreferenceRow = {
  enabled: boolean | null;
  max_emails_per_day: number | null;
  timezone: string | null;
};

const DEFAULT_TIMEZONE = "UTC";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isValidTimeZone(timezone: string | null | undefined) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function fallbackTimezone() {
  return process.env.SLEEPFIX_DEFAULT_TIMEZONE || DEFAULT_TIMEZONE;
}

function buildEmailHtml(opts: { appUrl: string; expectedWindowLabel: string | null }) {
  const windowLine = opts.expectedWindowLabel
    ? `<p style="margin:0 0 16px;color:#333;">You usually log around <strong>${htmlEscape(opts.expectedWindowLabel)}</strong>. No sleep entry is saved for today yet.</p>`
    : `<p style="margin:0 0 16px;color:#333;">No sleep entry is saved for today yet.</p>`;

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="color:#000080;margin:0 0 12px;">SleepFixMe</h1>
    <h2 style="margin:0 0 12px;">Log last night's sleep</h2>
    ${windowLine}
    <p style="margin:0 0 20px;color:#333;">Add last night's sleep so SleepFix can keep your pattern clean.</p>
    <p style="margin:0 0 20px;">
      <a href="${htmlEscape(opts.appUrl)}/protected/sleep" style="display:inline-block;background:#000080;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">
        Log sleep now
      </a>
    </p>
    <p style="font-size:13px;color:#666;margin-top:24px;">You are receiving this because you signed up for SleepFixMe reminders.</p>
  </div>`;
}

async function sendReminderEmail(opts: {
  to: string;
  expectedWindowLabel: string | null;
}) {
  const smtpHost = requiredEnv("SLEEPFIX_SMTP_HOST");
  const smtpPort = Number(requiredEnv("SLEEPFIX_SMTP_PORT"));
  const smtpUser = requiredEnv("SLEEPFIX_SMTP_USER");
  const smtpPass = requiredEnv("SLEEPFIX_SMTP_PASS");
  const fromEmail = process.env.SLEEPFIX_SMTP_FROM_EMAIL ?? smtpUser;
  const fromName = process.env.SLEEPFIX_SMTP_FROM_NAME ?? "SleepFixMe";
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sleepfixme.com").replace(/\/$/, "");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

 const info = await transporter.sendMail({
  from: `"${fromName}" <${fromEmail}>`,
  to: opts.to,
  subject: "TEST SleepFix reminder email",
  text: opts.expectedWindowLabel
    ? `You usually log around ${opts.expectedWindowLabel}. No sleep entry is saved for today yet. Log here: ${appUrl}/protected/sleep`
    : `No sleep entry is saved for today yet. Log here: ${appUrl}/protected/sleep`,
  html: buildEmailHtml({ appUrl, expectedWindowLabel: opts.expectedWindowLabel }),
});

console.log("SleepFix reminder email accepted:", {
  to: opts.to,
  messageId: info.messageId,
  accepted: info.accepted,
  rejected: info.rejected,
  response: info.response,
});
}

export async function GET(req: Request) {
  const startedAt = new Date();

  try {
  const expectedSecret = "sleepfixcron123";

const url = new URL(req.url);
const receivedSecret =
  getBearerToken(req) ??
  req.headers.get("x-cron-secret") ??
  url.searchParams.get("secret");

if (!receivedSecret || receivedSecret !== expectedSecret) {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 }
  );
}

    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: usersResp, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersErr) throw usersErr;

    const users = (usersResp.users ?? []) as AuthUser[];
    const results: Array<{
      user_id: string;
      email: string;
      action: string;
      reason?: string;
      timezone?: string;
      todayYMD?: string;
      expectedWindowLabel?: string | null;
      minutesLate?: number | null;
      sampleSize?: number;
      loggedToday?: boolean;
    }> = [];

    for (const user of users) {
      if (!user.id || !user.email) continue;

      const { data: pref, error: prefErr } = await supabase
        .from("sleep_reminder_preferences")
        .select("enabled,max_emails_per_day,timezone")
        .eq("user_id", user.id)
        .maybeSingle<ReminderPreferenceRow>();

      if (prefErr) {
        results.push({ user_id: user.id, email: user.email, action: "skipped", reason: prefErr.message });
        continue;
      }

      if (pref && pref.enabled === false) {
        results.push({ user_id: user.id, email: user.email, action: "skipped", reason: "disabled" });
        continue;
      }

      const timezone = isValidTimeZone(pref?.timezone) ? String(pref?.timezone) : fallbackTimezone();
      const todayYMD = toLocalYMD(startedAt, timezone);

      const { data: existingLogs, error: logErr } = await supabase
        .from("sleep_reminder_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("reminder_date", todayYMD)
        .limit(pref?.max_emails_per_day ?? 1);

      if (logErr) {
        results.push({ user_id: user.id, email: user.email, action: "skipped", reason: logErr.message, timezone, todayYMD });
        continue;
      }

      const maxEmails = pref?.max_emails_per_day ?? 1;
      if ((existingLogs ?? []).length >= maxEmails) {
        results.push({ user_id: user.id, email: user.email, action: "skipped", reason: "already_sent_today", timezone, todayYMD });
        continue;
      }

      const { data: nights, error: nightsErr } = await supabase
        .from("sleep_nights")
        .select("created_at,local_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (nightsErr) {
        results.push({ user_id: user.id, email: user.email, action: "skipped", reason: nightsErr.message, timezone, todayYMD });
        continue;
      }

      const reminder = buildAdaptiveReminderState((nights ?? []) as NightRow[], startedAt, timezone);

      if (!reminder.shouldShow) {
        results.push({
          user_id: user.id,
          email: user.email,
          action: "not_due",
          timezone,
          todayYMD,
          expectedWindowLabel: reminder.expectedWindowLabel,
          minutesLate: reminder.minutesLate,
          sampleSize: reminder.sampleSize,
          loggedToday: reminder.loggedToday,
        });
        continue;
      }

      try {
        await sendReminderEmail({
          to: user.email,
          expectedWindowLabel: reminder.expectedWindowLabel,
        });

        await supabase.from("sleep_reminder_logs").insert({
          user_id: user.id,
          reminder_date: reminder.todayYMD,
          expected_window_label: reminder.expectedWindowLabel,
          minutes_late: reminder.minutesLate,
          email_to: user.email,
          status: "sent",
        });

        results.push({
          user_id: user.id,
          email: user.email,
          action: "sent",
          timezone,
          todayYMD,
          expectedWindowLabel: reminder.expectedWindowLabel,
          minutesLate: reminder.minutesLate,
          sampleSize: reminder.sampleSize,
          loggedToday: reminder.loggedToday,
        });
      } catch (err: any) {
        await supabase.from("sleep_reminder_logs").insert({
          user_id: user.id,
          reminder_date: reminder.todayYMD,
          expected_window_label: reminder.expectedWindowLabel,
          minutes_late: reminder.minutesLate,
          email_to: user.email,
          status: "error",
          error_message: err?.message ?? "Unknown email error",
        });

        results.push({
          user_id: user.id,
          email: user.email,
          action: "error",
          reason: err?.message ?? "Unknown error",
          timezone,
          todayYMD,
          expectedWindowLabel: reminder.expectedWindowLabel,
          minutesLate: reminder.minutesLate,
          sampleSize: reminder.sampleSize,
          loggedToday: reminder.loggedToday,
        });
      }
    }

    const summary = results.reduce<Record<string, number>>((acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      checked: users.length,
      summary,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected reminder error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
