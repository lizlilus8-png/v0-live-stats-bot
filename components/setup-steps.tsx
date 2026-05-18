"use client";

import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface SetupStepsProps {
  inviteUrl: string;
  hasClientId: boolean;
}

const steps = [
  {
    num: 1,
    title: "Enable Message Content Intent",
    body: 'Go to discord.com/developers/applications → your app → Bot → scroll to "Privileged Gateway Intents" → enable "Message Content Intent". Click Save Changes.',
  },
  {
    num: 2,
    title: "Invite the bot to your server",
    body: "Click the Invite Bot button at the top of this page. Select your server and click Authorize.",
  },
  {
    num: 3,
    title: "Download the bot",
    body: "Click the three dots (···) in the top-right of v0 → Download ZIP. Extract the ZIP, then open the bot/ folder — that is the only folder you need.",
  },
  {
    num: 4,
    title: "Create a Railway project",
    body: "Go to railway.app and create a free account. Click New Project → Deploy from local directory. Drag and drop just the bot/ folder.",
  },
  {
    num: 5,
    title: "Add environment variables on Railway",
    body: "In your Railway project, click Variables and add these two required values:",
    vars: ["DISCORD_BOT_TOKEN", "LOGGED_TG_SESSION_COOKIE"],
  },
  {
    num: 6,
    title: "Deploy",
    body: "Railway will auto-detect the package.json and railway.toml inside the bot/ folder and start the bot automatically. Check the logs — you should see the bot come online.",
  },
  {
    num: 7,
    title: "Type !stats in your server",
    body: 'Go to any channel in your Discord server and type:',
    code: "!stats",
    note: "Optional: set STATS_CHANNEL_ID in Railway vars to restrict the command to one channel.",
  },
];

export default function SetupSteps({ inviteUrl, hasClientId }: SetupStepsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground tracking-tight text-balance">Setup Guide</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Deploy to Railway in minutes — no credit card required.
        </p>
      </div>

      {/* Invite status */}
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
            {hasClientId ? "Bot invite link is ready" : "Set DISCORD_CLIENT_ID to unlock the invite link"}
          </p>
          {hasClientId && (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline break-all"
            >
              {inviteUrl}
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
              <p className="pl-7 text-[10px] text-muted-foreground italic">{step.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
