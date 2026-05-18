"use client";

import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface SetupStepsProps {
  inviteUrl: string;
  hasClientId: boolean;
}

const steps = [
  {
    num: 1,
    title: "Deploy to Vercel",
    body: 'Click "Publish" in the top-right of v0, or push to GitHub and import into Vercel. Your Vercel URL will become the STATS_API_URL for the bot.',
  },
  {
    num: 2,
    title: "Add env vars to Vercel",
    body: "In your Vercel project settings, add LOGGED_TG_SESSION_COOKIE, STATS_API_SECRET (any random string), and DISCORD_CLIENT_ID.",
    vars: ["LOGGED_TG_SESSION_COOKIE", "STATS_API_SECRET", "DISCORD_CLIENT_ID"],
  },
  {
    num: 3,
    title: "Enable Message Content Intent",
    body: 'Go to discord.com/developers/applications → your app → Bot → scroll to "Privileged Gateway Intents" → enable Message Content Intent. Save.',
  },
  {
    num: 4,
    title: "Invite the bot",
    body: "Use the invite link at the top of this page (it appears once DISCORD_CLIENT_ID is set). Add the bot to your server with Send Messages + Read Message History.",
  },
  {
    num: 5,
    title: "Run the bot locally (or on Railway)",
    body: "The bot needs a persistent process. Download the project ZIP, set the env vars below in .env.local, then run:",
    code: "pnpm install && pnpm bot",
    note: "Or deploy bot/index.js on Railway, Render, or Fly.io for 24/7 uptime.",
  },
  {
    num: 6,
    title: "Set bot env vars",
    body: "In your .env.local (or Railway/Render env settings), add these three:",
    vars: ["DISCORD_BOT_TOKEN", "STATS_API_URL=https://your-app.vercel.app/api/stats", "STATS_API_SECRET"],
  },
  {
    num: 7,
    title: "Use it",
    body: 'Type in any channel in your server:',
    code: "!stats",
  },
];

export default function SetupSteps({ inviteUrl, hasClientId }: SetupStepsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight text-balance">Setup Guide</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Follow these steps to get your bot running 24/7.
          </p>
        </div>
      </div>

      {/* Invite button status */}
      <div
        className={`flex items-start gap-3 rounded-lg p-3 border ${
          hasClientId
            ? "border-green-500/30 bg-green-500/5"
            : "border-yellow-500/30 bg-yellow-500/5"
        }`}
      >
        {hasClientId ? (
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1.5">
          <p className={`text-xs font-semibold ${hasClientId ? "text-green-400" : "text-yellow-400"}`}>
            {hasClientId ? "Bot invite link ready" : "Add DISCORD_CLIENT_ID to unlock invite link"}
          </p>
          {hasClientId && (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              {inviteUrl.slice(0, 64)}...
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.num} className="bg-card border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.num}
              </span>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-7">{step.body}</p>
            {step.vars && (
              <div className="pl-7 flex flex-wrap gap-1.5">
                {step.vars.map((v) => (
                  <code
                    key={v}
                    className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-[10px] font-mono"
                  >
                    {v}
                  </code>
                ))}
              </div>
            )}
            {step.code && (
              <pre className="pl-7 font-mono text-xs text-green-400">{step.code}</pre>
            )}
            {step.note && (
              <p className="pl-7 text-[10px] text-muted-foreground">{step.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
