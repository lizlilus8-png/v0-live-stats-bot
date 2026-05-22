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
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

// ── Config ──────────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const SHORT_API_BASE = "https://linkurlshort.page.gd";
const PREFIX         = "!";

// ── Cookie challenge solver ──────────────────────────────────────────────────────
// The site protects all requests with a slowAES-based JS cookie challenge.
// We fetch aes.js once, solve it in Node, then attach __test= to every POST.
let _cachedCookie = null;

async function getSolvedCookie(fetch) {
  if (_cachedCookie) return _cachedCookie;

  // 1. GET the homepage to retrieve the challenge values from the HTML
  const homeRes = await fetch(`${SHORT_API_BASE}/`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const homeHtml = await homeRes.text();

  // Extract the three hex strings passed to slowAES.decrypt(c, 2, a, b)
  const aMatch = homeHtml.match(/toNumbers\(['\"]([0-9a-f]{32})['\"]\)/g);
  if (!aMatch || aMatch.length < 3) throw new Error("Cookie challenge values not found");

  const extract = (s) => s.match(/['\"]([0-9a-f]{32})['\"]/)[1];
  const aHex = extract(aMatch[0]);
  const bHex = extract(aMatch[1]);
  const cHex = extract(aMatch[2]);

  // 2. Fetch the aes.js library from the site
  const aesRes  = await fetch(`${SHORT_API_BASE}/aes.js`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const aesCode = await aesRes.text();

  // 3. Run the AES decryption in a Node vm to get the cookie value
  const vm = require("vm");
  const ctx = {};
  vm.runInNewContext(aesCode, ctx);

  function toNumbers(d) {
    const e = [];
    d.replace(/(..)/g, (d) => e.push(parseInt(d, 16)));
    return e;
  }
  function toHex(arr) {
    return arr.map((b) => (b < 16 ? "0" : "") + b.toString(16)).join("");
  }

  const a = toNumbers(aHex);
  const b = toNumbers(bHex);
  const c = toNumbers(cHex);
  const cookieVal = toHex(ctx.slowAES.decrypt(c, 2, a, b));

  _cachedCookie = cookieVal;
  return cookieVal;
}

// ── Discord client ──────────────────────────────────────────────────────────────
// ── Welcomer config ─────────────────────────────────────────────────────────────
const WELCOME_CHANNEL_ID = "1506536157016494140";
const WELCOME_GIF        = "https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif";

// ── Startup lock — refuse to run if another instance already holds the lock ──────
// Uses a TCP server on a fixed local port. If the port is already taken, this
// process is a duplicate and must exit immediately.
const net = require("net");
const LOCK_PORT = 47123;
const lockServer = net.createServer();
lockServer.listen(LOCK_PORT, "127.0.0.1", () => {
  console.log(`[bot] Instance lock acquired on port ${LOCK_PORT}. Starting bot...`);
});
lockServer.on("error", () => {
  console.error("[bot] Another instance is already running. Exiting to prevent duplicate responses.");
  process.exit(0);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", async () => {
  console.log(`[bot] Online as ${client.user.tag}`);
  client.user.setActivity("!hyperlink", { type: ActivityType.Listening });

  // Register /announce slash command globally
  const announceCommand = new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a custom embed announcement to a channel")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send the announcement in")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON();

  try {
    await client.application.commands.set([announceCommand]);
    console.log("[bot] Slash commands registered.");
  } catch (err) {
    console.error("[bot] Failed to register slash commands:", err.message);
  }
});

// ── Welcomer ────────────────────────────────────────────────────────────────────
client.on("guildMemberAdd", async (member) => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  const welcomeEmbed = new EmbedBuilder()
    .setDescription(
      "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ   | ɢᴀᴛᴇᴡᴀʏ` <a:emoji_8:1506236357775720548> ───\n\n" +
      "<a:emoji_3:1500695831169204295> ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴏᴜʀ ꜱᴇʀᴠᴇʀ ᴛʜᴀᴛ ʜᴀꜱ ᴍᴀɴʏ ꜰᴇᴀᴛᴜʀᴇꜱ ᴀɴᴅ ʙᴇꜱᴛ ꜱɪᴛᴇꜱ ᴇxɪꜱᴛ\n\n" +
      "<:emoji_4:1501269124330950787> ʙᴇꜱᴛ ʙᴇᴀᴍ ꜱɪᴛᴇꜱ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**"
    )
    .setImage(WELCOME_GIF)
    .setFooter({
      text: `Welcome ${member.user.username}`,
      iconURL: member.user.displayAvatarURL({ dynamic: true }),
    });

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [welcomeEmbed],
  });
});

// ── !server — Roblox server list ────────────────────────────────────────────────
const ROBLOX_SERVERS = [
  {
    id: "psx_ps99", label: "PSX & PS99",
    invites: [
      "https://discord.gg/biggames",
      "https://discord.gg/ps99",
      "https://discord.com/invite/KMnsh3AcjP",
      "https://discord.com/invite/NYJJzwhYwv",
    ],
  },
  {
    id: "petsgo", label: "Pets Go",
    invites: [
      "https://discord.com/invite/TGnsYv9PxT",
      "https://discord.com/invite/petsgotrades",
      "https://discord.com/invite/petsgo",
      "https://discord.com/invite/psxc",
    ],
  },
  {
    id: "brainrot", label: "Steal A Brainrot",
    invites: [
      "https://discord.gg/abrainrot",
      "https://discord.gg/sab",
      "https://discord.gg/fischin",
      "https://discord.gg/beanie",
      "https://discord.gg/sammy",
      "https://discord.gg/thebrainrot",
      "https://discord.gg/stealarot",
      "https://discord.gg/stealabrainrod",
      "https://discord.gg/stealbrainrots",
    ],
  },
  {
    id: "deepwoken", label: "Deepwoken",
    invites: [
      "https://discord.gg/deepwoken",
      "https://discord.gg/deepwokenbuilder",
      "https://discord.com/invite/deepwokeninfo",
      "https://discord.com/invite/deepwoken-wiki-768257335751704638",
      "https://discord.com/invite/dwth",
      "https://discord.com/invite/Z2MDbwrsz8",
    ],
  },
  {
    id: "jailbreak", label: "Jailbreak",
    invites: [
      "https://discord.com/invite/jailbreak",
      "https://discord.com/invite/zStnNURTeU",
      "https://discord.com/invite/jbvalues",
      "https://discord.com/invite/jailbreaktradingnetwork",
      "https://discord.com/invite/robloxjailbreak",
    ],
  },
  {
    id: "rivals", label: "Rivals",
    invites: [
      "https://discord.com/invite/robloxrivals",
      "https://discord.com/invite/nosniygames",
      "https://discord.com/invite/3VtJR2KJ5X",
      "https://discord.com/invite/rivalslfg",
      "https://discord.com/invite/rivalz",
      "https://discord.com/invite/richboyrivals-1271970269212311662",
      "https://discord.com/invite/sync",
    ],
  },
  {
    id: "trading", label: "Overall Trading",
    invites: [
      "https://discord.com/invite/R4yTPvs3Jx",
      "https://discord.com/invite/xRWEdttHGU",
      "https://discord.com/invite/KYkv6baXmU",
      "https://discord.com/invite/jT2FZDFvwV",
      "https://discord.com/invite/9CrfkYN6TG",
      "https://discord.com/invite/CQnHJhTGfc",
      "https://discord.com/invite/7ZAh2Dmu6G",
      "https://discord.com/invite/xrpcbPykzd",
      "https://discord.com/invite/4Dd8VKvh8p",
      "https://discord.gg/4T5YHBShJW",
      "https://discord.com/invite/NYJJzwhYwv",
    ],
  },
  {
    id: "dahood", label: "Da Hood",
    invites: [
      "https://discord.com/invite/dht",
      "https://discord.com/invite/branslam",
      "https://discord.com/invite/dheurope",
      "https://discord.com/invite/dhmarket",
      "https://discord.com/invite/dhcasino",
      "https://discord.com/invite/dhvalues",
      "https://discord.com/invite/robloxaccs",
      "https://discord.com/invite/xhHxKKTpqC",
      "https://discord.com/invite/y4ZV4VYvtx",
      "https://discord.com/invite/yhMGy7q2Ym",
    ],
  },
  {
    id: "fisch", label: "Fisch",
    invites: [
      "https://discord.com/invite/cuKz5SK3md",
      "https://discord.gg/fischplaza",
      "https://discord.gg/fischdispo",
      "https://discord.com/invite/fischparadise",
      "https://discord.com/invite/auroraborealis",
      "https://discord.com/invite/ApkW65qeZQ",
    ],
  },
  {
    id: "anime", label: "Anime Games",
    invites: [
      "https://discord.gg/animereborn",
      "https://discord.gg/animevanguards",
      "https://discord.gg/defenders",
      "https://discord.gg/animelaststand",
      "https://discord.com/invite/adventures",
    ],
  },
  {
    id: "bloxfruits", label: "Blox Fruits",
    invites: [
      "https://discord.com/invite/srdark",
      "https://discord.com/invite/tradings",
      "https://discord.com/invite/fantasyplays",
      "https://discord.com/invite/toslow",
      "https://discord.gg/bloxtrade",
      "https://discord.com/invite/bfhs",
      "https://discord.com/invite/kitt",
      "https://discord.gg/bloxzy",
      "https://discord.gg/bfts",
    ],
  },
  {
    id: "plsdonate", label: "Pls Donate",
    invites: [
      "https://discord.gg/donomadness",
      "https://discord.gg/the-donation-hub-983494809278889985",
      "https://discord.gg/bloxbots",
      "https://discord.gg/londonsfinest",
      "https://discord.gg/grinds",
      "https://discord.gg/hazem",
    ],
  },
  {
    id: "mm2", label: "MM2",
    invites: [
      "https://discord.gg/mm2",
      "https://discord.gg/murdermystery2",
      "https://discord.gg/murder-mystery-2-wiki-657257335751704638",
      "https://discord.com/invite/mm2deal",
      "https://discord.com/invite/jd",
    ],
  },
  {
    id: "bladeball", label: "Blade Ball",
    invites: [
      "https://discord.gg/bladeball",
      "https://discord.gg/bladeballtrading",
      "https://discord.gg/gA6n2xQEEZ",
      "https://discord.com/invite/hu9CgvukGz",
    ],
  },
  {
    id: "tsunami", label: "Escape Tsunami",
    invites: [
      "https://discord.com/invite/escapetsunamiforbrainrots",
      "https://discord.com/invite/escapetsunamibrainrot",
      "https://discord.com/invite/escapetsunamis",
      "https://discord.com/invite/escapefromtsunami",
      "https://discord.com/invite/getbrainrot",
      "https://discord.com/invite/X8jMFab5WU",
    ],
  },
  {
    id: "adoptme", label: "Adopt Me",
    invites: [
      "https://discord.com/invite/amtv",
      "https://discord.com/invite/adoptme",
      "https://discord.com/invite/amd",
      "https://discord.com/invite/adopt",
      "https://discord.com/invite/amv",
      "https://discord.com/invite/crosstrade",
    ],
  },
  {
    id: "growagarden", label: "Grow A Garden",
    invites: [
      "https://discord.gg/growagarden",
      "https://discord.gg/stocknotifier",
      "https://discord.gg/growagardentrades",
      "https://discord.gg/gaghub",
      "https://discord.gg/grows",
      "https://discord.gg/vorld",
      "https://discord.gg/gagnotifier",
      "https://discord.gg/gagstock",
      "https://discord.gg/gag",
    ],
  },
];

// Build button rows using index as customId to avoid special characters / length issues
function buildServerRows(servers) {
  const rows = [];
  for (let i = 0; i < servers.length; i += 5) {
    const chunk = servers.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      chunk.map((s, offset) =>
        new ButtonBuilder()
          .setCustomId(`srv:${i + offset}`)
          .setLabel(s.label)
          .setStyle(ButtonStyle.Primary)
          .setEmoji({ id: "1500695831169204295", name: "emoji_3", animated: true })
      )
    );
    rows.push(row);
  }
  return rows;
}

// ── Cross-process deduplication via /tmp lock files ─────────────────────────────
// Because Railway may briefly run two instances during a deploy, we use exclusive
// file creation in /tmp to ensure only ONE process handles each message/interaction.
const fs = require("fs");

function tryLock(id) {
  const file = `/tmp/bot_lock_${id}`;
  try {
    // wx = exclusive create — fails if file already exists
    fs.writeFileSync(file, process.pid.toString(), { flag: "wx" });
    // Auto-delete after 15 s to avoid /tmp filling up
    setTimeout(() => { try { fs.unlinkSync(file); } catch (_) {} }, 15_000);
    return true;  // this process owns the lock
  } catch (_) {
    return false; // another process already handled it
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild)     return;

  // Only one process handles each message
  if (!tryLock(`msg_${message.id}`)) return;

  const content = message.content.trim().toLowerCase();

  // ── !server ──
  if (content === `${PREFIX}server`) {
    const serverEmbed = new EmbedBuilder()
      .setDescription(
        "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ   | ꜱᴇʀᴠᴇʀꜱ` <a:emoji_8:1506236357775720548> ───\n\n" +
        "<a:emoji_3:1500695831169204295> ꜱᴇʀᴠᴇʀꜱ ᴜ ᴡᴀɴᴛ ᴛᴏ ʜɪᴛ/ʙᴇᴀᴍ ɪɴ\n\n" +
        "<:emoji_4:1501269124330950787> ᴀʟʟ ꜱᴇʀᴠᴇʀꜱ ʟɪꜱᴛ ᴛᴏ ʙᴇᴀᴍ**"
      )
      .setImage("https://cdn.discordapp.com/attachments/1500676577183268914/1506552431855800391/5dba8cbd-8441-48ae-8b64-5e8f39555b90.gif?ex=6a0eadca&is=6a0d5c4a&hm=3e5d2141bbf449b3a387bb54e8b085b069e22815670186aa65fb1aef191fc055&")
      .setFooter({
        text: `Requested by ${message.author.username}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      });

    await message.reply({
      embeds: [serverEmbed],
      components: buildServerRows(ROBLOX_SERVERS),
    });
    return;
  }

  if (content !== `${PREFIX}hyperlink`) return;

  // Build the embed that prompts the user to submit a link
  const embed = new EmbedBuilder()
    .setDescription(
      "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ   | ʜʏᴘᴇʀʟɪɴᴋ` <a:emoji_8:1506236357775720548> ───\n\n" +
      "<a:emoji_3:1500695831169204295> ᴜꜱᴇ ᴛʜɪꜱ ᴛᴏᴏʟ ᴛᴏ ɢᴇɴᴇʀᴀᴛᴇ ʜʏᴘᴇʀʟɪɴᴋꜱ ᴛʜᴀᴛ ʙʏᴘᴀꜱꜱ ᴅɪꜱᴄᴏʀᴅ ᴡᴀʀɴɪɴɢꜱ\n\n" +
      "<:emoji_4:1501269124330950787> ʙᴇꜱᴛ ʜʏᴘᴇʀʟɪɴᴋ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**"
    )
    .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
    .setFooter({
      text: `Requested by ${message.author.username}`,
      iconURL: message.author.displayAvatarURL({ dynamic: true }),
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("hyperlink_submit")
      .setLabel("ʜʏᴘᴇʀʟɪɴᴋ")
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: "1500695831169204295", name: "emoji_3", animated: true })
  );

  await message.reply({ embeds: [embed], components: [row] });
});

// ── Button / Modal interactions ─────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!tryLock(`int_${interaction.id}`)) return;

  // ── /announce slash command — open the announce modal ──
  if (interaction.isChatInputCommand() && interaction.commandName === "announce") {
    const targetChannel = interaction.options.getChannel("channel");

    const modal = new ModalBuilder()
      .setCustomId(`announce_modal:${targetChannel.id}`)
      .setTitle("Create Announcement Embed");

    const titleInput = new TextInputBuilder()
      .setCustomId("ann_title")
      .setLabel("Title (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. Server Update")
      .setRequired(false);

    const bodyInput = new TextInputBuilder()
      .setCustomId("ann_body")
      .setLabel("Body / Description")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Write your announcement here...")
      .setRequired(true);

    const footerInput = new TextInputBuilder()
      .setCustomId("ann_footer")
      .setLabel("Footer text (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. Insanity Network")
      .setRequired(false);

    const imageInput = new TextInputBuilder()
      .setCustomId("ann_image")
      .setLabel("Image URL (optional, shown as large image)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://example.com/banner.gif")
      .setRequired(false);

    const colorInput = new TextInputBuilder()
      .setCustomId("ann_color")
      .setLabel("Embed color hex (optional, e.g. #5865F2)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("#5865F2")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(bodyInput),
      new ActionRowBuilder().addComponents(footerInput),
      new ActionRowBuilder().addComponents(imageInput),
      new ActionRowBuilder().addComponents(colorInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // ── /announce modal submitted ──
  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId.startsWith("announce_modal:")
  ) {
    // Defer immediately so Discord does not time out (3 s limit)
    await interaction.deferReply({ ephemeral: true });

    try {
      const channelId    = interaction.customId.split(":")[1];
      const targetChannel = interaction.guild.channels.cache.get(channelId);

      if (!targetChannel || !targetChannel.isTextBased()) {
        await interaction.editReply({ content: "Could not find the target channel." });
        return;
      }

      // Safe reads — optional fields return empty string when left blank
      const safeGet = (id) => {
        try { return interaction.fields.getTextInputValue(id).trim(); }
        catch { return ""; }
      };

      const annTitle  = safeGet("ann_title");
      const annBody   = safeGet("ann_body");
      const annFooter = safeGet("ann_footer");
      const annImage  = safeGet("ann_image");
      const annColor  = safeGet("ann_color");

      if (!annBody) {
        await interaction.editReply({ content: "Body / Description cannot be empty." });
        return;
      }

      const embed = new EmbedBuilder().setDescription(annBody);

      if (annTitle) embed.setTitle(annTitle);
      if (annImage) embed.setImage(annImage);

      // Parse hex color
      if (annColor) {
        const hex = parseInt(annColor.replace("#", ""), 16);
        if (!isNaN(hex)) embed.setColor(hex);
      }

      // Footer: always include requester avatar
      const footerText = annFooter
        ? `${annFooter} • Announced by ${interaction.user.username}`
        : `Announced by ${interaction.user.username}`;

      embed.setFooter({
        text: footerText,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });

      embed.setTimestamp();

      await targetChannel.send({ embeds: [embed] });

      await interaction.editReply({
        content: `Announcement sent to <#${channelId}>.`,
      });
    } catch (err) {
      console.error("[bot] /announce error:", err.message);
      await interaction.editReply({ content: "Something went wrong sending the announcement." });
    }
    return;
  }

  // ── Server category button pressed ──
  if (interaction.isButton() && interaction.customId.startsWith("srv:")) {
    const index  = parseInt(interaction.customId.split(":")[1], 10);
    const server = ROBLOX_SERVERS[index];

    if (!server) {
      await interaction.reply({ content: "Unknown server category.", ephemeral: true });
      return;
    }

    const inviteLines = server.invites.join("\n");

    await interaction.reply({
      content: `**ꜱᴇʀᴠᴇʀꜱ ᴛᴏ ʙᴇᴀᴍ — ${server.label}**\n\n${inviteLines}`,
      ephemeral: true,
    });
    return;
  }

  // ── Button pressed: open modal ──
  if (interaction.isButton() && interaction.customId === "hyperlink_submit") {
    const modal = new ModalBuilder()
      .setCustomId("hyperlink_modal")
      .setTitle("ꜱᴜʙᴍɪᴛ ʏᴏᴜʀ ʙᴇᴀᴍ ʟɪɴᴋ ᴛᴏ ʙʏᴘᴀꜱꜱ ᴅɪꜱᴄᴏʀᴅ ꜰʟᴀɢ");

    const urlInput = new TextInputBuilder()
      .setCustomId("url_input")
      .setLabel("ᴘᴀꜱᴛᴇ ʏᴏᴜʀ ʙᴇᴀᴍʟɪɴᴋ ʜᴇʀᴇ")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://roblox.com/users/6362762")
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

    await interaction.deferReply({ ephemeral: true });

    try {
      const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

      // Step 1 — solve the AES cookie challenge
      const cookie = await getSolvedCookie(fetch);

      // Step 2 — POST the URL as a form with the solved cookie
      const res = await fetch(`${SHORT_API_BASE}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":   "Mozilla/5.0",
          "Cookie":       `__test=${cookie}`,
        },
        body: new URLSearchParams({ url: rawUrl }).toString(),
        redirect: "follow",
      });

      const html = await res.text();

      // Step 3 — extract FMT and SHORT_URL from the JS constants the site embeds
      // e.g. const FMT = "[text](https://linkurlshort.page.gd/index.php?r=XXXXX)";
      const fmtMatch      = html.match(/const FMT\s*=\s*"((?:[^"\\]|\\.)*)"/);
      const shortMatch    = html.match(/const SHORT_URL\s*=\s*"((?:[^"\\]|\\.)*)"/);

      console.log("[v0] HTML response length:", html.length);
      console.log("[v0] FMT match:", fmtMatch);
      console.log("[v0] SHORT match:", shortMatch);
      console.log("[v0] HTML snippet:", html.substring(0, 500));

      if (!fmtMatch || !shortMatch) {
        await interaction.editReply({
          content: "Could not shorten that link. Make sure the URL starts with `https://` and try again.",
        });
        return;
      }

      // Unescape the JS string (site escapes slashes as \/)
      const fmt      = fmtMatch[1].replace(/\\\//g, "/");
      const shortUrl = shortMatch[1].replace(/\\\//g, "/");

      // Build result embed — no color so there is no left-bar tint
      const resultEmbed = new EmbedBuilder()
        .setTitle(`<:emoji_10:1506872243979030598> *ʜᴇʀᴇ'ꜱ ʏᴏᴜʀ ʜʏᴘᴇʀʟɪɴᴋ ʀᴇᴀᴅʏ ᴛᴏ ᴜꜱᴇ — ᴄᴏᴘʏ ɪᴛ ʙᴇʟᴏᴡ ᴀɴᴅ ᴘᴀꜱᴛᴇ ɪᴛ ᴡʜᴇʀᴇᴠᴇʀ ʏᴏᴜ ɴᴇᴇᴅ.*`)
        .setDescription(`\`${fmt}\``)
        .setFooter({
          text: `Requested by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        });

      // Send the fmt as a separate plain message so users can select & copy just the text
      await interaction.editReply({ embeds: [resultEmbed] });
      await interaction.followUp({ content: fmt, ephemeral: true });
    } catch (err) {
      console.error("[bot] hyperlink error:", err.message);
      await interaction.editReply({
        content: "<:emoji_11:1506864561435967509> Something went wrong while hiding your link. Please try again.",
      });
    }
  }
});

// ── Graceful shutdown — ensures Railway kills the old instance cleanly ───────────
// Without this, Railway's SIGTERM is ignored and old + new instances both run,
// causing every message to be responded to twice or more.
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[bot] Received ${signal}, shutting down...`);
  try {
    await client.destroy();
  } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Health-check HTTP server (required by Railway) ──────────────────────────────
const http = require("http");
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  })
  .listen(PORT, () => {
    console.log(`[bot] Health-check server listening on port ${PORT}`);
  });

// ── Start ───────────────────────────────────────────────────────────────────────
if (!DISCORD_TOKEN) {
  console.error("[bot] DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

client.login(DISCORD_TOKEN);
