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
const WELCOME_CHANNEL_ID = "1509360469104922735";
const WELCOME_GIF        = "https://cdn.discordapp.com/attachments/1506434367491276812/1509041263230324856/40ed5bef-646a-4e42-92cf-cdc9908dd6f9.gif?ex=6a17bbb1&is=6a166a31&hm=0e026f50c278136c764ec4fde7d38e031b41963b455b8146a3a3024fc3e1e4d9";

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

// Auto-purge function
async function autoPurgeChannels() {
  console.log("[v0] Auto-purge started at", new Date().toISOString());
  
  const channelIds = [
    "1509373485179211898",
    "1509373384243548222",
    "1509373133939937403",
  ];

  const startTime = Date.now();
  const channelDeletionCounts = {}; // Track deleted count per channel

  try {
    for (const channelId of channelIds) {
      try {
        console.log(`[v0] Purging channel ${channelId}...`);
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          console.log(`[v0] Channel ${channelId} is not text-based or not found`);
          channelDeletionCounts[channelId] = 0;
          continue;
        }

        // Fetch all messages in the channel
        let allMessages = [];
        let lastId = undefined;
        let fetchCount = 0;

        while (true) {
          const fetchOptions = { limit: 100 };
          if (lastId) fetchOptions.before = lastId;

          const messages = await channel.messages.fetch(fetchOptions);
          fetchCount++;
          console.log(`[v0] Fetch ${fetchCount} for channel ${channelId}: ${messages.size} messages`);
          
          if (messages.size === 0) break;

          allMessages = allMessages.concat(Array.from(messages.values()));
          lastId = messages.last().id;
        }

        console.log(`[v0] Total messages to delete in ${channelId}: ${allMessages.length}`);

        // Bulk delete messages in batches of up to 100 (Discord limit)
        let deletedInChannel = 0;
        for (let i = 0; i < allMessages.length; i += 100) {
          const batch = allMessages.slice(i, i + 100);
          try {
            await channel.bulkDelete(batch, true);
            deletedInChannel += batch.length;
            console.log(`[v0] Bulk deleted ${batch.length} messages from ${channelId}. Total: ${deletedInChannel}/${allMessages.length}`);
          } catch (err) {
            console.log(`[v0] Error bulk deleting batch in ${channelId}:`, err.message);
          }
        }
        
        channelDeletionCounts[channelId] = deletedInChannel;
        console.log(`[v0] Finished purging ${channelId}. Deleted ${deletedInChannel} messages`);
      } catch (err) {
        console.log(`[v0] Error purging channel ${channelId}:`, err.message);
        channelDeletionCounts[channelId] = 0;
      }
    }

    const endTime = Date.now();
    const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`[v0] Auto-purge completed. Total deleted: ${Object.values(channelDeletionCounts).reduce((a, b) => a + b, 0)} messages in ${elapsedSeconds}s`);

    // Send individual purge result embed to each channel with its own deletion count
    for (const channelId of channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const deletedCount = channelDeletionCounts[channelId] || 0;
          
          const purgeEmbed = new EmbedBuilder()
            .setDescription(`**─── <a:emoji_8:1506236357775720548> \`ɪɴꜱᴀɴɪᴛʏ | ᴘᴜʀɢᴇ\` <a:emoji_8:1506236357775720548> ───**`)
            .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
            .setFooter({
              text: `Auto purge finished • Deleted ${deletedCount} messages in ${elapsedSeconds}s`,
              iconURL: "https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif",
            });
          
          await channel.send({ embeds: [purgeEmbed] });
          console.log(`[v0] Sent purge result to channel ${channelId} (deleted ${deletedCount} messages)`);
        }
      } catch (err) {
        console.log(`[v0] Could not send purge result to ${channelId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[v0] Auto-purge error:", err);
  }
}

client.once("ready", async () => {
  console.log(`[bot] Online as ${client.user.tag}`);
  client.user.setActivity("!hyperlink", { type: ActivityType.Listening });

  // Run auto-purge every 7 hours (25200000 milliseconds)
  setInterval(autoPurgeChannels, 25200000);
  // Run immediately on startup
  console.log("[v0] Auto-purge scheduled every 7 hours");
  autoPurgeChannels();

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
      "<:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> *welcome to* @***ɪɴꜱᴀɴɪᴛʏ***\n" +
      "<:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794>\n\n" +
      "*__**ʙᴇꜱᴛ ʙᴍ ꜱɪᴛᴇꜱ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**__*<a:emoji_13:1508646379751342130>\n" +
      "<:emoji_19:1509035464714358794>\n" +
      "<:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_20:1509039477673295882>[ʀᴜʟᴇꜱ](https://discord.com/channels/1500661537415630898/1500669912396337162)\n" +
      "<:emoji_19:1509035464714358794> <:emoji_20:1509039477673295882>[ᴡᴇʙꜱɪᴛᴇꜱ](https://discord.com/channels/1500661537415630898/1500673944158605422)\n" +
      "<:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794>\n" +
      "<:emoji_21:1509040875064266892> [ᴍᴇᴛʜᴏᴅꜱ](https://discord.com/channels/1500661537415630898/1500674571781541918)\n" +
      "<:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794> <:emoji_20:1509039477673295882>[ᴛᴜᴛᴏʀɪᴀʟꜱ](https://discord.com/channels/1500661537415630898/1500674485047660714)"
    )
    .setImage(WELCOME_GIF)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({
      text: `Welcome ${member.user.username}`,
      iconURL: member.user.displayAvatarURL({ dynamic: true }),
    });

  await channel.send({
    content: `Welcome To our server <@${member.id}>`,
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
          .setEmoji({ id: "1508694920972468347", name: "emoji_17", animated: true })
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
        "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ | ꜱᴇʀᴠᴇʀꜱ` <a:emoji_8:1506236357775720548> ───\n\n" +
        "<a:emoji_13:1508646379751342130>  ꜱᴇʀᴠᴇʀꜱ ᴜ ᴡᴀɴᴛ ᴛᴏ ʜɪᴛ/ʙᴇᴀᴍ ɪɴ\n\n" +
        "<:emoji_14:1508646444607864872>  ᴀʟʟ ꜱᴇʀᴠᴇʀꜱ ʟɪꜱᴛ ᴛᴏ ʙᴇᴀᴍ**"
      )
      .setThumbnail("https://cdn.discordapp.com/attachments/1506891768938102947/1508616463479734312/bonsai-discord_1.gif?ex=6a163011&is=6a14de91&hm=d9c287b5c3c48aba045acc2bbbc6f815e71ccb4d8d3ad2126d2fd82c1ce684ec")
      .setImage("https://cdn.discordapp.com/attachments/1507033407148789941/1508393791072243732/345781fe-1012-4a45-b51c-765b101eeb76.gif?ex=6a1560b0&is=6a140f30&hm=8d8c75218c86a662f5880cea94b59f716a15e885d18ab7c13fb0cad441d4baed")
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

  // ── !delete ──
  if (content === `${PREFIX}delete`) {
    if (!message.channel.name.startsWith("ticket-")) {
      await message.reply({ content: "This command can only be used in ticket channels.", ephemeral: true });
      return;
    }

    try {
      await message.channel.delete();
    } catch (err) {
      console.log(`[v0] Error deleting ticket channel:`, err.message);
      await message.reply({ content: "Failed to delete channel. Please try again." });
    }
    return;
  }

  // ── !embed ──
  if (content === `${PREFIX}embed`) {
    const methods = [
      {
        name: "ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ",
        image1: "https://cdn.discordapp.com/attachments/1506434367491276812/1509399153321443388/image0_1.gif?ex=6a190901&is=6a17b781&hm=8d73fe9824d744a19022718c65a469779f8e8f9f86e82a0b5fda2f9010d9da5a",
        image2: "https://cdn.discordapp.com/attachments/1506434367491276812/1509394265141415936/1773637630733-5bee7763-8a95-48c0-8857-b9f2196e8d11.gif?ex=6a190473&is=6a17b2f3&hm=2866b7b7ca9eff6d39f1ccbc30640a1ee0fa62adac8619771cf9d455c329a76b",
        body: "**── ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ──**\n\n__**ʜᴏᴡ ɪᴛ ᴡᴏʀᴋꜱ**__\n- ʏᴏᴜ ɢᴏ ʟɪᴠᴇ ᴏɴ ᴛɪᴋᴛᴏᴋ ᴜꜱɪɴɢ ᴀ ꜰᴀᴋᴇ ʀᴏʙʟᴏx ɢɪᴠᴇᴀᴡᴀʏ ᴠɪᴅᴇᴏ, ᴀɴᴅ ᴛʀʏ ᴛᴏ ɢᴇᴛ ᴀꜱ ᴍᴀɴʏ ᴠɪᴇᴡᴇʀꜱ ᴀꜱ ᴘᴏꜱꜱɪʙʟᴇ. ᴀɴᴅ ʏᴏᴜ ᴡɪʟʟ ʜᴀᴠᴇ ꜰᴀᴋᴇ ʟɪɴᴋ ɪɴ ʏᴏᴜʀ ᴛɪᴋᴛᴏᴋ ʙɪᴏ ꜱᴏ ʏᴏᴜ ɢᴇᴛ ᴀᴄᴄᴏᴜɴᴛꜱ\n\n__**ʀᴇqᴜɪʀᴇᴍᴇɴᴛꜱ**__\n- ꜰᴏʀ ᴘᴄ ʟɪᴠᴇ ʏᴏᴜ ɴᴇᴇᴅ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ᴡɪᴛʜ ʟɪᴠᴇ ꜱᴛᴜᴅɪᴏ ᴀᴄᴄᴇꜱꜱ\n- ꜰᴏʀ ᴍᴏʙɪʟᴇ ʟɪᴠᴇ ʏᴏᴜ ɴᴇᴇᴅ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ᴡɪᴛʜ ᴍᴏʙɪʟᴇ ɢᴀᴍɪɴɢ ʟɪᴠᴇ ᴀᴄᴄᴇꜱꜱ\n- ᴀʟꜱᴏ ᴛʜɪꜱ ᴍᴇᴛʜᴏᴅꜱ ɴᴇᴇᴅꜱ ꜱᴏᴍᴇ ʙʀᴀɪɴ, ᴄᴀɴᴛ ʙᴇ ᴀ ʀᴇᴛᴀʀᴅ.\n\n__**ʜᴏᴡ ᴛᴏ ɢᴇᴛ ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ᴀᴄᴄ**__\n- ɢᴏ ᴛᴏ ʀᴏʙʟᴏx ᴄʀᴏꜱꜱᴛʀᴀᴅɪɴɢ ꜱᴇʀᴠᴇʀ ᴀɴᴅ ᴛʀᴀᴅᴇ ꜰᴏʀ ᴏɴᴇ\n- ᴜꜱᴇ ᴛʜɪꜱ ꜰᴏʟʟᴏᴡᴇʀ ʙᴏᴛᴛɪɴɢ ꜱᴇʀᴠɪᴄᴇ, ᴛᴏ ʙᴏᴛ 1ᴋ ꜰᴏʟʟᴏᴡᴇʀꜱ ᴏɴʟʏ ꜰᴏʀ 2$ https://yoursmm.net/\n- ᴏʀ ᴜꜱᴇ ᴛʜɪꜱ ᴍᴇᴛʜᴏᴅ ᴛᴏ ᴇᴀꜱɪʟ�� ɢᴇᴛ 1ᴋ ꜰᴏʟʟᴏᴡᴇʀꜱ ɪɴ 3 ᴅᴀʏꜱ ᴏʀ ʟᴇꜱꜱ https://justpaste.it/follow-method\n\n__**ᴄʜᴏᴏꜱɪɴɢ ʟɪɴᴋ**__\n- ɢᴏ ᴛᴏ ᴠᴀʀɪᴀʀᴇꜱ ꜱɪᴛᴇꜱ ᴀɴᴅ ᴛʜᴇɴ ᴘɪᴄᴋ ᴏɴᴇ ᴏꜰ ᴛʜᴇ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋꜱ\n- ᴀʟᴡᴀʏꜱ ʀᴇᴍᴇᴍʙᴇʀ ᴛᴏ ᴛᴇꜱᴛ ᴛʜᴇ ʟɪɴᴋ ʙᴇꜰᴏʀᴇ ɢᴏɪɴɢ ʟɪᴠᴇ\n- ɪꜰ ʟɪɴᴋ ɪꜱ ꜰʟᴀɢɢᴇᴅ ᴛʜᴇɴ ᴛʀʏ ʀᴇᴍᴏᴠɪɴɢ ᴛʜᴇ ᴡᴡᴡ. ᴏʀ ʜᴛᴛᴘꜱ: ꜰʀᴏᴍ ᴛʜᴇ ʟɪɴᴋ\n- ᴜꜱɪɴɢ ʙᴇᴀᴄᴏɴꜱ.ᴀɪ > ʏᴏᴜ ᴄᴀɴ ᴍᴀᴋᴇ ʙᴇᴀᴄᴏɴꜱ.ᴀɪ ʙɪᴏʟɪɴᴋ ᴛᴏ ᴍᴀᴋᴇ ɪᴛ ʟᴏᴏᴋ ᴍᴏʀᴇ ʀᴇᴀʟɪꜱᴛɪᴄ. ᴛʜɪꜱ ɪꜱ ᴍʏ ʙᴇᴀᴄᴏɴꜱ ᴀɪ https://beacons.ai/joinadoptme ʏᴏᴜ ᴄᴀɴ ᴛᴀᴋᴇ ɪɴꜱᴘɪʀᴀᴛɪᴏɴ ᴀɴᴅ ᴛʜᴇɴ ᴀᴅᴅ ɪᴛ ᴛᴏ ʏᴏᴜʀ ᴛɪᴋᴛᴏᴋ ʙɪᴏ\n- ɪꜰ ʏᴏᴜ ᴄᴀɴᴛ ᴀᴅᴅ ʟɪɴᴋ ᴛᴏ ᴛɪᴋᴛᴏᴋ ʙɪᴏ ᴛʜᴇɴ ᴍᴀᴋᴇ ʏᴏᴜʀ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ɪɴᴛᴏ ʙᴜꜱɪɴᴇꜱꜱ ᴀᴄᴄᴏᴜɴᴛ ꜱᴏ ʏᴏᴜ ᴄᴀɴ ᴀᴅᴅ ʙᴜꜱɪɴᴇꜱꜱ ʟɪɴᴋ\n\n__**ʜᴏᴡ ᴛᴏ ɢᴏ ʟɪᴠᴇ/ʟᴏᴏᴘ ᴠɪᴅᴇᴏ**__\n- ᴏɴ ᴘᴄ ʏᴏᴜ ʜᴀᴠᴇ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪᴠᴇ ꜱᴛᴜᴅɪᴏ ᴀɴᴅ ᴛʜᴇɴ ꜱᴇᴛ ɪᴛ ᴜᴘ ᴛʜᴇɴ ᴊᴜꜱᴛ ᴘɪᴄᴋ ᴀ ɢᴏᴏᴅ ᴠɪᴅᴇᴏ ᴀɴᴅ ɢᴏ ʟɪᴠᴇ\n- ᴏɴ ᴍᴏʙɪʟᴇ ʏᴏᴜ ʜᴀᴠᴇ ᴛᴏ ʟᴏᴏᴘ ᴛʜᴇ ᴠɪᴅᴇᴏ ꜰʀᴏᴍ ɢᴀʟʟᴇʀʏ ꜱᴇᴛᴛɪɴɢꜱ ᴀʟᴛᴇᴀꜱᴛ ᴏɴ ᴀɴᴅʀᴏɪᴅ\n\n**__ᴍᴜꜱᴛ ʀᴇᴍᴇᴍʙᴇʀ ᴛʜᴇꜱᴇ__**\n- ᴡʜᴇɴ ʏᴏᴜ ɢᴏ ʟɪᴠᴇ ᴀʟᴡᴀʏꜱ ʀᴇᴍᴇᴍʙᴇʀ ᴛᴏ ᴍᴜᴛᴇ ʏᴏᴜʀ ᴍɪᴄ ᴄʜᴇᴄᴋ ᴛᴜᴛᴏʀɪᴀʟ ᴏɴ ʏᴛ ʜᴏᴡ ᴛᴏ.\n- ᴘᴜᴛ ɴᴏᴛɪꜰɪᴄᴀᴛɪᴏɴꜱ ᴏꜰꜰ\n- ʀᴇᴍᴇᴍʙᴇʀ ᴛᴏ ʙʟᴀᴄᴋʟɪꜱᴛ ʙᴀᴅ ᴡᴏʀᴅꜱ\n\n__**ᴘɪᴄᴋɪɴɢ ɢᴀᴍᴇ ᴄᴀᴛᴇɢᴏʀʏ ᴀɴᴅ ᴛɪᴛʟᴇ**__\n- ɪꜰ ʏᴏᴜʀ�� ᴏɴ ᴍᴏʙɪʟᴇ ᴛʜᴇɴ ʏᴏᴜʀ ʟɪᴠᴇ ɢᴀᴍᴇ ᴄᴀᴛᴇɢᴏʀʏ __ᴍᴜꜱᴛ__ ʙᴇ ꜱᴜʙᴡᴀʏ ꜱᴜʀꜰᴇʀꜱ ᴏʀ ᴄʟᴀꜱʜ ʀᴏʏᴀʟᴇ. ᴏɴ ᴘᴄ ɪᴛ ᴄᴀɴ ʙᴇ ʀᴏʙʟᴏx\n- ᴛɪᴛʟᴇ ᴄᴀɴ ʙᴇ ᴘʀᴏʙᴀʙʟʏ ᴀɴʏᴛʜɪɴɢ ʙᴜᴛ ʙᴇ ᴄᴀʀᴇꜰᴜʟ ᴡɪᴛʜ ᴡᴏʀᴅꜱ ʟɪᴋᴇ ꜰʀᴇᴇ ᴀɴᴅ ɢɪᴠᴇᴀᴡᴀʏ ꜱɪɴᴄᴇ ᴛɪᴋᴛᴏᴋ ᴅᴏᴇꜱɴᴛ ᴀʟᴡᴀʏꜱ ʟɪᴋᴇ ᴛʜᴇᴍ\n\n__**ʜᴏᴡ ʟᴏɴɢ ᴛᴏ ʙᴇ ʟɪᴠᴇ ꜰᴏʀ**__\n- ɴᴇᴠᴇʀ ʙᴇ ʟɪᴠᴇ ꜰᴏʀ ᴀʟᴏᴛ ᴏꜰ ʜᴏᴜʀꜱ ᴜɴʟᴇꜱꜱ ʏᴏᴜʀ ʟɪᴠᴇ ɪꜱ ꜱᴛᴀʙʟᴇ ᴀꜱꜰ. ʟɪᴋᴇ ʜᴀᴠɪɴɢ ᴀʙᴛ ʜᴜɴᴅʀᴇᴅ ᴠɪᴇᴡᴇʀꜱ ᴏʀ ᴍᴏʀᴇ ꜰᴏʀ ʜᴏᴜʀꜱ.\n- ᴡʜᴇɴ ʏᴏᴜ ꜱᴛᴀʀᴛ ʟɪᴠᴇ ʏᴏᴜ ꜱʜᴏᴜʟᴅ ᴅᴏ ɪᴛ ᴏɴʟʏ ꜰᴏʀ 20 ᴍɪɴꜱ ᴀɴᴅ ᴛʜᴇɴ ᴄʜᴇᴄᴋ ᴛᴏ ɪꜰ ᴇɴᴅ ᴛʜᴇ ʟɪᴠᴇ ᴏʀ ɴᴏᴛ.\n\n__**ʜᴇʀᴇꜱ ᴡʜᴇɴ ᴛᴏ ᴇɴᴅ ᴀɴᴅ ᴡʜᴇɴ ᴛᴏ ɴᴏᴛ ᴛᴏ**__\n- ɪꜰ ᴀꜰᴛᴇʀ 20 ᴍɪɴꜱ ʏᴏᴜʀ ᴠɪᴇᴡᴇʀꜱ ᴀʀᴇ ʙᴇʟᴏᴡ 10 ᴛʜᴇɴ ᴇɴᴅ ʏᴏᴜʀ ʟɪᴠᴇ\n- ɪꜰ ᴛʜᴇʏʀᴇ ᴀʙ��ᴠᴇ 10 ᴛʜᴇɴ ��ʜᴇʀᴇꜱ ꜱᴍᴀʟʟ ᴄʜᴀɴᴄᴇ ᴏꜰ ɢᴏɪɴɢ ᴠɪʀᴀʟ\n- ᴀʙᴏᴠᴇ 20 ᴠɪᴇᴡᴇʀꜱ = ɢᴏᴏᴅ ᴄʜᴀɴᴄᴇ ᴛᴏ ɢᴏ ᴠɪʀᴀʟ\n- ᴀʙᴏᴠᴇ 40 ᴠɪᴇᴡᴇʀꜱ ɪꜱ ᴠᴇʀʏ ɢᴏᴏᴅ ᴋᴇᴇᴘ ɪᴛ ᴜᴘ ᴜɴᴛɪʟ ᴛʜᴇʏ ꜱᴛᴀʀᴛ ᴅʀᴏᴘᴘɪɴɢ!!\n\n**__ᴘᴜᴍᴘɪɴɢ ᴍᴇᴛʜᴏᴅ__**\nᴛʜɪꜱ ɪꜱ ᴀ ᴍᴇᴛʜᴏᴅ ᴛᴏ ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ɢʀᴏᴡ ᴠɪᴇᴡᴇʀꜱ.\n- ʙᴀꜱɪᴄᴀʟʟʏ ᴊᴜꜱᴛ ɢᴏ ʟɪᴠᴇ ᴜɴᴛɪʟ ᴠɪᴇᴡᴇʀꜱ ɢʀᴏᴡ ᴀɴᴅ ᴡʜᴇɴ ᴛʜᴡʏ ᴅʀᴏᴘ ʙʏ ᴀ ʙɪᴛ ᴊᴜꜱᴛ ᴇɴᴅ ᴛʜᴇ ʟɪᴠᴇ ɪᴍᴍᴇᴅɪᴀᴛᴇʟʟʏ > ᴀɴᴅ ᴛʜᴇɴ ꜱᴛᴀʀᴛ ʟɪᴠᴇ ᴀʟᴍᴏꜱᴛ ɪᴍᴍᴇᴅɪᴀʟʟʏ ᴀɢᴀɪɴ ᴀɴᴅ ʀᴇᴘᴇᴀᴛ ᴛʜɪꜱ ᴜɴᴛɪʟ ʏᴏᴜ ʜᴀᴠᴇ ꜱᴛᴀʙʟᴇ ᴀꜱꜰ ʟɪᴠᴇ ᴡɪᴛʜ ʜᴜɴᴅʀᴇᴅꜱ ᴏꜰ ᴠɪᴇᴡᴇʀꜱ!!!\n\n**ʜᴇʀᴇꜱ ꜱᴏᴍᴇ ʀᴀɴᴅᴏᴍ ᴛᴜᴛᴏʀɪᴀʟ ᴠɪᴅꜱ ɪ ꜰᴏᴜɴᴅ ʏᴏᴜ ᴄᴀɴ ᴡᴀᴛᴄʜ ᴛᴏ ʟᴇᴀʀɴ, __ᴍᴜꜱᴛ__ ꜱᴛɪʟʟ ʀᴇᴀᴅ ꜰᴜʟʟ ᴛᴇxᴛ ᴏᴛʜᴇʀᴡɪꜱᴇ ʏᴏᴜ ᴡᴏɴᴛ ɢᴇᴛ ᴠɪᴇᴡᴇʀꜱ 😐**\nhttps://youtu.be/B-zZHryfuTs?si=XmrEatq2l3nyd0UP\nhttps://www.youtube.com/watch?v=RGaJMb7bRq8&t=1s"
      },
      {
        name: "ʙᴜʏɪɴɢ ꜱᴇʟʟɪɴɢ",
        image1: "https://cdn.discordapp.com/attachments/1506434367491276812/1509399153321443388/image0_1.gif?ex=6a190901&is=6a17b781&hm=8d73fe9824d744a19022718c65a469779f8e8f9f86e82a0b5fda2f9010d9da5a",
        image2: "https://cdn.discordapp.com/attachments/1506434367491276812/1509394265141415936/1773637630733-5bee7763-8a95-48c0-8857-b9f2196e8d11.gif?ex=6a190473&is=6a17b2f3&hm=2866b7b7ca9eff6d39f1ccbc30640a1ee0fa62adac8619771cf9d455c329a76b",
        body: "**── ʙᴜʏɪɴɢ/ꜱᴇʟʟɪɴɢ ᴍᴇᴛʜ ──**\n\n**You need to have an PC it wont work otherwise cuz it doesnt let you hide the browser domain on the top on mobile! The Method goes like this: You go into Discord Roblox Selling Servers and look for an account you like and act like your gonna buy. Ask them if they can let you log in to check it. (you will log in on your bea* link with the acc) Tell em your gonna do it on stream if they arent letting you. Now to hide the Domain up top it will say: .py / We dont want that! To Cover it up just go up to where the domain is and Type : roblox.com/login (look attachments) (dont hit enter js leave it there) Then you can proceed to login there! Now if they have a pin binded to the account you can ask them and they will sometimes give it to you (tell em you wont be able to do any stupid shit cuz they prob have 2fa on there. / But that wont bother you cuz when they give you the pin the system automatically cracks it! and will add auth or change age) Now just log em do your stuff and your good.**\n\n**Tell em this when your gonna ask to login:**\n\\`\\`\\`Umm is there anyway i can login to the account on screenshare i will not go in game or anything i will just be in homescreen the sec im in just give me 20s to send the money\\`\\`\\`\n\n**You can spam this to get dms:**\n\\`\\`\\`# Lf korblox or headless accounts willing to go first after i log in to see that it has email verified 2 step and all of the items Also looking for mid accounts wtih 5k+ robux\n# Payments in : Crypto, Cashapp, Paypal, ApplePay, Giftcards\\`\\`\\`\n\n**Fake paypal error to show**\nhttps://cdn.discordapp.com/attachments/1308658524703817818/1478981619925782629/image-4.png?ex=69aa6078&is=69a90ef8&hm=66bd1b859bba2e3f13e5d0ad4d89804961b1a8f50b4d80511db4c5e562841ca1\n\n> Servers to do ts in:\n> https://discord.gg/Jq2YTzWtKA\n> https://discord.gg/DN92bfYThS"
      },
      {
        name: "ᴅᴜᴀʟʜᴏᴏᴋ",
        image1: "https://cdn.discordapp.com/attachments/1506434367491276812/1509399153321443388/image0_1.gif?ex=6a190901&is=6a17b781&hm=8d73fe9824d744a19022718c65a469779f8e8f9f86e82a0b5fda2f9010d9da5a",
        image2: "https://cdn.discordapp.com/attachments/1506434367491276812/1509394265141415936/1773637630733-5bee7763-8a95-48c0-8857-b9f2196e8d11.gif?ex=6a190473&is=6a17b2f3&hm=2866b7b7ca9eff6d39f1ccbc30640a1ee0fa62adac8619771cf9d455c329a76b",
        body: "**── ᴅᴜᴀʟʜᴏᴏᴋ ᴍᴇᴛʜ ──**\n\n**ꜱᴛᴇᴘ 1: ᴄʀᴇᴀᴛᴇ ᴀ ꜱᴇʀᴠᴇʀ & ��ʜᴇ ᴅᴜᴀʟʜᴏᴏᴋ ʟɪɴᴋ ɪɴ ᴛʜᴇ ᴡᴇʙꜱɪᴛᴇ ᴡʜᴇʀᴇ ʏᴏᴜ ᴀʀᴇ ᴛᴇᴀᴄʜɪɴɢ ᴍᴇᴍʙᴇʀꜱ ʜᴏᴡ ᴛᴏ ɢᴇᴛ ʜɪᴛꜱ ᴀᴛ ᴛʜᴇ ꜱᴀᴍᴇ ᴛɪᴍᴇ, ʏᴏᴜ'ʟʟ ʙᴇ ꜱᴛᴇᴀʟɪɴɢ ᴛʜᴇɪʀ ʜɪᴛꜱ**\n\n**ꜱᴛᴇᴘ 2: ʜᴇᴀᴅ ᴏᴠᴇʀ ᴛᴏ**\nhttps://discord.com/template/Cg2G6AdH6ZkR\n**ᴅᴏᴇꜱɴᴛ ʜᴀᴠᴇ ᴛᴏ ʙᴇ ᴇxᴀᴄᴛʟʏ ʟɪᴋᴇ ᴛʜᴀᴛ ʙᴜᴛ, ɪᴛ ᴅ��ᴇꜱ ʜᴀᴠᴇ ᴛᴏ ʜᴀᴠᴇ ᴛʜᴇ ꜱᴇʀᴠᴇʀ ᴀꜱᴘᴇᴄᴛꜱ.**\n\n**ꜱᴛᴇᴘ 3: ᴏɴᴄᴇ ʏᴏᴜ ꜰɪɴɪꜱʜᴇᴅ ᴡɪᴛʜ ʏᴏᴜʀ ᴡʜᴏʟᴇ ꜱᴇʀᴠᴇʀ ᴀɴᴅ ᴅᴏɴᴇ ᴡɪᴛʜ ɪᴛ, ᴛʀʏ ᴛᴏ ᴘᴀʀᴛɴᴇʀ ᴡɪᴛʜ ᴀꜱ ᴍᴀɴʏ ꜱᴇʀᴠᴇʀꜱ ᴀꜱ ʏᴏᴜ ᴄᴀɴ, ɪɴᴠɪᴛᴇ ʏᴏᴜʀ ꜰʀɪᴇɴᴅꜱ, ᴀɴᴅ ᴇᴠᴇɴ ꜱᴛᴇᴀʟ ᴍᴇᴍʙᴇʀꜱ ᴏᴜᴛ ᴏꜰ ᴅɪꜰꜰᴇʀᴇɴᴛ ꜱᴇʀᴠᴇʀꜱ ꜱᴇᴄʀᴇᴛʟʏ**\n\n**ꜱᴛᴇᴘ 4: ʏᴏᴜ ᴅᴏ ᴡᴀɴᴛ ᴛᴏ ʜᴀᴠᴇ ʏᴏᴜʀ ꜱᴇʀᴠᴇʀ ᴀᴄᴛɪᴠᴇ, ᴀᴅᴅ ᴍᴏᴅꜱ, ᴀᴅᴍɪɴꜱ, ᴀɴᴅ ᴍᴀʏʙᴇ ᴇᴠᴇɴ ᴀ ᴄᴏ-ᴏᴡɴᴇʀ!!**\n\n**ᴛᴜᴛᴏʀɪᴀʟ:**\nhttps://streamable.com/u88d7u"
      },
      {
        name: "ᴛɪᴋᴛᴏᴋ ɴᴏᴛ ʟɪᴠᴇ",
        image1: "https://cdn.discordapp.com/attachments/1506434367491276812/1509399153321443388/image0_1.gif?ex=6a190901&is=6a17b781&hm=8d73fe9824d744a19022718c65a469779f8e8f9f86e82a0b5fda2f9010d9da5a",
        image2: "https://cdn.discordapp.com/attachments/1506434367491276812/1509394265141415936/1773637630733-5bee7763-8a95-48c0-8857-b9f2196e8d11.gif?ex=6a190473&is=6a17b2f3&hm=2866b7b7ca9eff6d39f1ccbc30640a1ee0fa62adac8619771cf9d455c329a76b",
        body: "**── ᴛɪᴋᴛᴏᴋ (ɴᴏᴛ ʟɪᴠᴇ) ᴍᴇᴛʜ ──**\n\n**ᴄʀᴇᴀᴛᴇ ᴀɴ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ʀᴇʟᴀᴛᴇᴅ ᴛᴏ ᴛʜᴇ ɢᴀᴍᴇ ʏᴏᴜ ᴡᴀɴᴛ**\n\n**ᴄʜᴀɴɢᴇ ʏᴏᴜʀ ᴀᴄᴄᴏᴜɴᴛ ɪɴᴛᴏ ᴀ ʙᴜꜱɪɴᴇꜱꜱ ᴀᴄᴄ ꜱᴏ ʏᴏᴜ ᴄᴀɴ ᴘᴜᴛ ʟɪɴᴋꜱ ᴏɴ ʏᴏᴜʀ ʙɪᴏ**\n\n**ᴇɴᴊᴏʏ, ɴᴏ ɴᴇᴇᴅ ᴛᴏ ʟɪᴠᴇꜱᴛʀᴇᴀᴍ**\n\nhttps://cdn.discordapp.com/attachments/1277482286232637544/1284084370898157578/lv_0_20240831184505.mp4?ex=673866c3&is=67371543&hm=95ece82de1fe102a7b89611da3f3915dc4baa2c94a5c9dc86545c8283c8d750f"
      }
    ];
    
    // Create threads for replays
    const replaysThread = await message.channel.threads.create({
      name: "ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ʀᴇᴘʟᴀʏꜱ",
      autoArchiveDuration: 60,
    });

    const replaysData = [
      "<:InsanityPoint:1503717002475339947> **ᴘʟꜱ ᴅᴏɴᴀᴛᴇ:**",
      "https://streamable.com/oo4auk",
      "https://cdn.discordapp.com/attachments/1318617752474488893/1321545002899345428/vipAmandavip_vipamandavip_is_LIVE_-_TikTok_LIVE_2024-12-04_20-43-03_1.mp4?ex=68068e31&is=68053cb1&hm=4efb8381578fea71208626fd6cf85883330542e4b22b52cb4f8de91500bd25f6",
      "https://cdn.discordapp.com/attachments/1331244342899114056/1336963056462462987/ypqzp9zt_2.mp4?ex=6805f4e0&is=6804a360&hm=3a2a053dd0bb326985978887f49d0262b1d90cefaf04eb2be68055cada0734cf",
      "",
      "<:InsanityPoint:1503717002475339947> **ᴀᴅᴏᴘᴛ ᴍᴇ:**",
      "https://media.discordapp.net/attachments/1331008387831562270/1333082064034992229/lv_0_20250120003043.mp4?ex=680e3feb&is=680cee6b&hm=9050cd833ab21189fee38c75332619ae02b4e912e2609a91e7a651b14823f6c5",
      "https://cdn.discordapp.com/attachments/1329545445520965642/1357751105676644484/JSPUF.mp4?ex=68066fc1&is=68051e41&hm=a5af10f0ff8c2990d3b7188af2c3c70ccadcf4bf7050a3ee539f16147b508264",
      "https://cdn.discordapp.com/attachments/1329804728061661196/1334028238200111145/Rich_Livvy_sunnyy_adoptme_is_LIVE_-_TikTok_LIVE_2024-10-20_00-21-39.mp4?ex=68067c5d&is=68052add&hm=d40a885d9d9e8db306b99b292c1fa55c0f6ddf0b7590e038eee7e76c75bf1a5c",
      "",
      "<:InsanityPoint:1503717002475339947> **ᴍᴍ2:**",
      "https://streamable.com/fjqo1x",
      "https://cdn.discordapp.com/attachments/1329804728061661196/1334028231644286987/preppyxhanna_preppyxhannas_is_LIVE_-_TikTok_LIVE_2024-10-06_20-42-48.mp4?ex=68067c5b&is=68052adb&hm=f43a4a5b754e667f033f318aedf033f713c71fc8261b47c07d45d96937f95de0",
      "",
      "<:InsanityPoint:1503717002475339947> **ʙʟᴏxꜰʀᴜɪᴛꜱ:**",
      "https://streamable.com/godall",
      "",
      "<:InsanityPoint:1503717002475339947> **ɢᴀɢ:**",
      "https://cdn.discordapp.com/attachments/1363585727979589823/1381334942885347398/op_asf_edited_replay_1.mp4?ex=68696aea&is=6868196a&hm=396b78b4219412bdc60bdbe61b1538bf54839d252f7a520efd215a6525d448b6"
    ];

    for (const item of replaysData) {
      if (item === "") {
        // Add spacing between sections
        await replaysThread.send("\u200b");
      } else {
        await replaysThread.send(item);
      }
    }

    for (const method of methods) {
      try {
        // Create thread with auto-archive after 1 hour but not locked
        const thread = await message.channel.threads.create({
          name: method.name,
          autoArchiveDuration: 60,
        });

        // First embed - only image
        const firstEmbed = new EmbedBuilder()
          .setImage(method.image1)
          .setColor(0x000000);

        // Second embed - content with image
        const secondEmbed = new EmbedBuilder()
          .setDescription(method.body)
          .setImage(method.image2)
          .setColor(0x000000);

        await thread.send({ embeds: [firstEmbed] });
        await thread.send({ embeds: [secondEmbed] });
      } catch (err) {
        console.log(`[v0] Error creating thread for ${method.name}:`, err.message);
      }
    }

    await message.reply({ content: "Method embeds created successfully!", ephemeral: true });
    return;
  }

  // ── !createbeamchannel ──
  if (content === `${PREFIX}createbeamchannel`) {
    if (!message.guild) {
      await message.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    try {
      console.log("[v0] Starting beam channel structure creation...");
      const guild = message.guild;

      const purgeChannelNames = ["🤖⌇・ᴄᴏᴍᴍᴀɴᴅꜱ", "🗨️⌇・ᴄʜᴀᴛ", "💸⌇・ꜰʟᴇx𓏵ᴛʀᴀᴅᴇ"];
      const newPurgeChannels = [];

      // Create community category and channels
      console.log("[v0] Creating community category...");
      const commCategory = await guild.channels.create({
        name: "ᴄᴏᴍᴍᴜɴɪᴛʏ",
        type: ChannelType.GuildCategory
      });

      const commChannels = [
        { name: "💎┋ᴠᴇʀɪꜰʏ", webhook: true },
        { name: "🔧┋ᴛᴏᴏʟꜱ", webhook: true },
        { name: "🧷┋ꜱɪᴛᴇꜱ", webhook: true }
      ];

      for (const ch of commChannels) {
        console.log("[v0] Creating channel:", ch.name);
        const channel = await guild.channels.create({
          name: ch.name,
          type: ChannelType.GuildText,
          parent: commCategory.id
        });

        if (ch.webhook) {
          try {
            await channel.createWebhook({ name: `${ch.name}-webhook` });
            console.log("[v0] Webhook created for:", ch.name);
          } catch (webhookErr) {
            console.log("[v0] Could not create webhook for", ch.name, ":", webhookErr.message);
          }
        }
      }

      // Create central category and channels
      console.log("[v0] Creating central category...");
      const centralCategory = await guild.channels.create({
        name: "ᴄᴇɴᴛʀᴀʟ",
        type: ChannelType.GuildCategory
      });

      const centralChannels = [
        "🤖⌇・ᴄᴏᴍᴍᴀɴᴅꜱ",
        "🗨️⌇・ᴄʜᴀᴛ",
        "💸⌇・ꜰʟᴇx𓏵ᴛʀᴀᴅᴇ"
      ];

      for (const chName of centralChannels) {
        console.log("[v0] Creating channel:", chName);
        const channel = await guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: centralCategory.id
        });
        newPurgeChannels.push(channel.id);
      }

      console.log("[v0] New purge channels:", newPurgeChannels.join(", "));

      await message.reply({
        content: `✅ Beam channel structure created successfully!\n\n**Categories:** ᴄᴏᴍᴍᴜɴɪᴛʏ, ᴄᴇɴᴛʀᴀʟ\n**Purge Channels:** ${newPurgeChannels.join(", ")}`,
        ephemeral: true
      });

      console.log("[v0] Beam channel creation completed successfully");
    } catch (err) {
      console.error("[v0] Full error creating channels:", err);
      console.error("[v0] Error stack:", err.stack);
      await message.reply({
        content: `❌ Error creating channels: ${err.message}`,
        ephemeral: true
      });
    }
    return;
  }

  // ── !ticket ──
  if (content === `${PREFIX}ticket`) {
    const ticketEmbed = new EmbedBuilder()
      .setDescription(
        "*<a:emoji_13:1508646379751342130> ᴄʟɪᴄᴋ ʙᴇʟᴏᴡ ᴛᴏ ᴄʀᴇᴀᴛᴇ ᴀ ꜱᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛ\n ɪꜰ ʏᴏᴜ ʜᴀᴠᴇ ᴀɴʏ ᴄᴏɴᴄᴇʀɴꜱ ᴊᴜꜱᴛ ᴄʀᴇᴀᴛᴇ ᴀ ᴛɪᴄᴋᴇᴛ*"
      )
      .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
      .setThumbnail("https://cdn.discordapp.com/attachments/1506434367491276812/1509022387964870816/a_2b9d08af401b8fcaf06b4092ef5f81fc.gif?ex=6a17aa1d&is=6a16589d&hm=93d5dfec700814195a3362ceafca91b32848bbe7dcb6b5ca60557f7171e4690b");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_create")
        .setLabel("ᴏᴘᴇɴ ᴛɪᴄᴋᴇᴛ")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: "1508646379751342130", name: "emoji_13", animated: true })
    );

    await message.channel.send({ embeds: [ticketEmbed], components: [row] });
    return;
  }

  if (content !== `${PREFIX}hyperlink`) return;

  // Build the embed that prompts the user to submit a link
  const embed = new EmbedBuilder()
    .setDescription(
      "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ   | ʜʏᴘᴇʀʟɪɴᴋ` <a:emoji_8:1506236357775720548> ───\n\n" +
      "<a:emoji_13:1508646379751342130> ᴜꜱᴇ ᴛʜɪꜱ ᴛᴏᴏʟ ᴛᴏ ɢᴇɴᴇʀᴀᴛᴇ ʜʏᴘᴇʀʟɪɴᴋꜱ ᴛʜᴀᴛ ʙʏᴘᴀꜱꜱ ᴅɪꜱᴄᴏʀᴅ ᴡᴀʀɴɪɴɢꜱ\n\n" +
      "<:emoji_14:1508646444607864872>  ʙᴇꜱᴛ ʜʏᴘᴇʀʟɪɴᴋ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**"
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
      .setEmoji({ id: "1508646379751342130", name: "emoji_13", animated: true })
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

  // ── Ticket button pressed: create ticket channel ──
  if (interaction.isButton() && interaction.customId === "ticket_create") {
    await interaction.deferReply({ ephemeral: true });
    
    const ticketNumber = Math.floor(Math.random() * 10000);
    const channelName = `ticket-${ticketNumber}`;

    try {
      // Create a private channel for the ticket
      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: ["ViewChannel"],
          },
          {
            id: client.user.id,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"],
          },
          {
            id: interaction.user.id,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
          },
          {
            id: "1501440578326368277",
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
          },
          {
            id: "1500729523593809921",
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
          },
        ],
      });

      // Send notification message and embed in the ticket channel
      const ticketNotificationEmbed = new EmbedBuilder()
        .setTitle("Support Ticket Created")
        .setDescription(
          `Welcome <@${interaction.user.id}>!\n\n` +
          `A support team has been notified. <@&1501440578326368277> <@&1500729523593809921>\n\n` +
          `Please describe your issue below and we'll assist you shortly.`
        )
        .setColor("#2f3136")
        .setFooter({
          text: `Ticket ID: ${ticketNumber}`,
        });

      await ticketChannel.send({
        content: `Support ticket created for <@${interaction.user.id}>. A support team member will be with you shortly!`,
        embeds: [ticketNotificationEmbed],
      });

      // Edit deferred reply
      await interaction.editReply({
        content: `Your support ticket has been created: <#${ticketChannel.id}>`,
      });
    } catch (err) {
      console.log(`[v0] Error creating ticket:`, err.message);
      await interaction.editReply({
        content: "Failed to create ticket. Please try again.",
      });
    }
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

      if (!fmtMatch || !shortMatch) {
        return;
      }

      // Unescape the JS string (site escapes slashes as \/)
      const fmt      = fmtMatch[1].replace(/\\\//g, "/");
      const shortUrl = shortMatch[1].replace(/\\\//g, "/");

      // Build result embed — no color so there is no left-bar tint
      const resultEmbed = new EmbedBuilder()
        .setTitle(`<:emoji_10:1506872243979030598> Here's your hyperlink ready to use — copy it below and paste it wherever you need.`)
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

// ── Start ──────────────────────────────────────────────��────────────────────────
if (!DISCORD_TOKEN) {
  console.error("[bot] DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

client.login(DISCORD_TOKEN);
