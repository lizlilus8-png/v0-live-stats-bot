require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
} = require("discord.js");

// ── Config ──────────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const SHORT_API_BASE = "https://linkurlshort.page.gd";
const PREFIX         = "!";

// ── Discord client ──────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`[bot] Online as ${client.user.tag}`);
  client.user.setActivity("!hyperlink", { type: ActivityType.Listening });
});

// ── !hyperlink command ──────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild)     return;

  const content = message.content.trim().toLowerCase();
  if (content !== `${PREFIX}hyperlink`) return;

  // Build the embed that prompts the user to submit a link
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Hide a Link with Hyperlink")
    .setDescription(
      "Want to disguise a long URL as a clean hyperlink?\n\n" +
      "Click **Submit Link** below, paste your URL, and the bot will return a formatted hyperlink you can share anywhere."
    )
    .addFields(
      { name: "How it works", value: "Your URL is posted to **linkurlshort.page.gd** and returned as a masked hyperlink.", inline: false },
      { name: "Privacy", value: "The link is visible only to you in this message reply.", inline: false }
    )
    .setFooter({ text: "Powered by linkurlshort.page.gd" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("hyperlink_submit")
      .setLabel("Submit Link")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔗")
  );

  await message.reply({ embeds: [embed], components: [row] });
});

// ── Button / Modal interactions ─────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  // ── Button pressed: open modal ──
  if (interaction.isButton() && interaction.customId === "hyperlink_submit") {
    const modal = new ModalBuilder()
      .setCustomId("hyperlink_modal")
      .setTitle("Submit a Link to Shorten");

    const urlInput = new TextInputBuilder()
      .setCustomId("url_input")
      .setLabel("Paste your URL here")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://example.com/very/long/url")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(urlInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // ── Modal submitted ──
  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId === "hyperlink_modal"
  ) {
    const rawUrl = interaction.fields.getTextInputValue("url_input").trim();

    await interaction.deferReply({ ephemeral: false });

    try {
      const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

      // POST as URL-encoded form — the site is HTML-based, not a JSON API
      const res = await fetch(`${SHORT_API_BASE}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (compatible; HyperlinkBot/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
        body: new URLSearchParams({ url: rawUrl }).toString(),
        redirect: "follow",
      });

      const html = await res.text();
      console.log("[v0] response status:", res.status);
      console.log("[v0] html snippet:", html.slice(0, 2000));

      // Try multiple patterns to find the short URL in the response HTML
      const patterns = [
        /https?:\/\/linkurlshort\.page\.gd\/index\.php\?r=[A-Za-z0-9_-]+/,
        /https?:\/\/linkurlshort\.page\.gd\/[A-Za-z0-9_-]{4,}/,
        /href=["'](https?:\/\/linkurlshort\.page\.gd[^"']+)["']/,
        /value=["'](https?:\/\/linkurlshort\.page\.gd[^"']+)["']/,
      ];

      let shortUrl = null;
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          // pattern 3 and 4 capture in group 1, others in group 0
          shortUrl = match[1] || match[0];
          console.log("[v0] matched pattern:", pattern, "->", shortUrl);
          break;
        }
      }

      if (!shortUrl) {
        console.log("[v0] no short URL found in html, full html length:", html.length);
        await interaction.editReply({
          content: `Could not shorten that link — the shortener did not return a valid URL.\n\nDebug: HTTP ${res.status}, HTML length: ${html.length} chars.`,
        });
        return;
      }

      // Formatted output exactly as the site shows it
      const formattedOutput = `[${rawUrl}](${shortUrl})`;

      const resultEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Link Shortened")
        .setDescription("Ready to copy and share")
        .addFields(
          { name: "Formatted Output", value: `\`\`\`\n${formattedOutput}\n\`\`\``, inline: false },
          { name: "Short URL", value: shortUrl, inline: false },
          { name: "Original URL", value: rawUrl, inline: false }
        )
        .setFooter({ text: "Powered by linkurlshort.page.gd" })
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });
    } catch (err) {
      console.error("[bot] hyperlink error:", err.message);
      await interaction.editReply({
        content: `Something went wrong: ${err.message}`,
      });
    }
  }
});

// ── Start ───────────────────────────────────────────────────────────────────────
if (!DISCORD_TOKEN) {
  console.error("[bot] DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

client.login(DISCORD_TOKEN);
