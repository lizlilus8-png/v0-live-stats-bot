import DiscordEmbedMockup from "@/components/discord-embed-mockup";
import SetupSteps from "@/components/setup-steps";

export default function Home() {
  const clientId = process.env.DISCORD_CLIENT_ID ?? "";
  const inviteUrl = clientId
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=274877908992&scope=bot`
    : "https://discord.com/developers/applications";

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      {/* Header bar */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold font-mono">LG</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">logged.tg Stats Bot</p>
            <p className="text-xs text-muted-foreground mt-0.5">Discord bot</p>
          </div>
        </div>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-md transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 71 55" fill="currentColor" aria-hidden="true">
            <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5 0.5a40.3 40.3 0 0 0-1.8 3.6 54.2 54.2 0 0 0-16.4 0A38 38 0 0 0 25.5.5 58.5 58.5 0 0 0 10.8 4.9C1.6 18.7-1 32.2.3 45.5a59 59 0 0 0 18 9.1 43.8 43.8 0 0 0 3.8-6.2 38.3 38.3 0 0 1-6-2.9l1.5-1.1a42 42 0 0 0 36 0l1.5 1.1a38.4 38.4 0 0 1-6 2.9 43.5 43.5 0 0 0 3.8 6.2 58.8 58.8 0 0 0 18-9.1C72 30.1 68.7 16.7 60.1 4.9ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Z" />
          </svg>
          Invite Bot
        </a>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10 grid lg:grid-cols-2 gap-10">

        {/* Left — embed preview */}
        <div className="space-y-4">
          <h1 className="text-xl font-bold text-foreground tracking-tight text-balance">
            Live Discord Embed Preview
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is what users see when they type{" "}
            <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-xs font-mono">!stats</code>{" "}
            in your server.
          </p>

          {/* Discord chat window */}
          <div
            className="rounded-lg overflow-hidden border border-border"
            style={{ backgroundColor: "oklch(0.22 0.005 260)" }}
          >
            {/* Channel bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
              <span className="text-muted-foreground text-sm">#</span>
              <span className="text-sm font-semibold text-foreground">general</span>
            </div>

            {/* Messages */}
            <div className="p-4 space-y-4">
              {/* User message */}
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-secondary shrink-0 flex items-center justify-center text-xs font-bold text-muted-foreground">
                  U
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">user</span>
                    <span className="text-xs text-muted-foreground">Today at 4:20 PM</span>
                  </div>
                  <p className="text-sm text-foreground mt-0.5 font-mono">!stats</p>
                </div>
              </div>

              {/* Bot reply */}
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-primary shrink-0 flex items-center justify-center text-xs font-bold text-primary-foreground">
                  LG
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-primary">logged.tg Bot</span>
                    <span className="text-xs bg-primary/20 text-primary px-1 rounded text-[10px] font-semibold uppercase tracking-wide">BOT</span>
                    <span className="text-xs text-muted-foreground">Today at 4:20 PM</span>
                  </div>
                  <DiscordEmbedMockup />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right — setup steps */}
        <div>
          <SetupSteps inviteUrl={inviteUrl} hasClientId={Boolean(clientId)} />
        </div>
      </div>
    </main>
  );
}
