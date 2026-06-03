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
const SHORT_API_BASE = "https://robloxjoin.site";
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

  console.log("[v0] Homepage response status:", homeRes.status);
  console.log("[v0] Homepage HTML (first 1000 chars):", homeHtml.substring(0, 1000));

  // Extract the three hex strings passed to slowAES.decrypt(c, 2, a, b)
  const aMatch = homeHtml.match(/toNumbers\(['\"]([0-9a-f]{32})['\"]\)/g);
  console.log("[v0] Cookie challenge pattern match result:", aMatch);
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
const WELCOME_GIF        = "https://cdn.discordapp.com/attachments/1507701712327016488/1509805649020588223/a_3ce24509633cbbceab6dbbd4502d1ef8.gif?ex=6a1a8395&is=6a193215&hm=33b9efbcf7043d60a90a49397fc2743598f60b29829293aa15269a06cbef0abb&";

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
            .setImage("https://cdn.discordapp.com/attachments/1507701712327016488/1509825761031487649/image0_1.gif?ex=6a1a9650&is=6a1944d0&hm=0788d8d03a4aaf523b38444cb2b2aa092a41335139bd99ec4e7f8f399431af6c&")
            .setFooter({
              text: `Auto purge finished • Deleted ${deletedCount} messages in ${elapsedSeconds}s`,
              iconURL: "https://cdn.discordapp.com/attachments/1507701712327016488/1509825761031487649/image0_1.gif?ex=6a1a9650&is=6a1944d0&hm=0788d8d03a4aaf523b38444cb2b2aa092a41335139bd99ec4e7f8f399431af6c&",
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

  // Run auto-purge every 10 hours (36000000 milliseconds)
  // DO NOT run on startup - only schedule the interval
  let autoPurgeInterval = setInterval(() => {
    console.log("[v0] Running scheduled auto-purge...");
    autoPurgeChannels();
  }, 36000000);
  
  console.log("[v0] Auto-purge scheduled to run every 10 hours");

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

  const now = new Date();
  const utcTime = now.toLocaleString('en-US', { timeZone: 'UTC' });

  const welcomeEmbed = new EmbedBuilder()
    .setDescription(
      "<:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794>\n" +
      "<:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794> <a:emoji_22:1509804158490771457>  <:emoji_19:1509035464714358794>  welcome to @***Insanity*** !!   — <:emoji_19:1509035464714358794>              <:emoji_19:1509035464714358794>\n" +
      "<:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794>     <:emoji_19:1509035464714358794>  [rules](https://discord.com/channels/1478596733016604736/1478596733457137768) `+` [sites](https://discord.com/channels/1500661537415630898/1509362001980166306) `+`[tutorials](https://discord.com/channels/1500661537415630898/1509365776958750803)\n" +
      "<:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794>  <:emoji_19:1509035464714358794> <:emoji_19:1509035464714358794>     <:emoji_19:1509035464714358794>     <:emoji_19:1509035464714358794>     <:emoji_19:1509035464714358794> <a:emoji_8:1506236357775720548> hf and say hi in chat ⊹"
    )
    .setImage(WELCOME_GIF)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({
      text: `discord.gg/insanity | ${utcTime}`,
    });

  await channel.send({
    content: `<@${member.id}> has joined the server! <:emoji_23:1509806070036566067>`,
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
          .setEmoji({ id: "1509804158490771457", name: "emoji_17", animated: true })
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
      .setImage("https://cdn.discordapp.com/attachments/1507701712327016488/1509827919705280512/a_83bbc624f3ac843c95b3387cdb7f4106.gif?ex=6a1a9853&is=6a1946d3&hm=9ae824ac32110fa5432cca99c88ee601537be2745b61ec15ac9aed54f83b0a8a&")
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

  // ── !tuts ──
  if (content === `${PREFIX}tuts`) {
    const tutorials = [
      {
        title: "ᴡᴇʙʜᴏᴏᴋ ᴛᴜᴛᴏʀɪᴀʟ ᴍᴏʙɪʟᴇ(ᴀɴᴅʀᴏɪᴅ)",
        message: "https://youtu.be/9oClR9rlkIc?si=CPjQIG30r-5_GKBt"
      },
      {
        title: "ᴡᴇʙʜᴏᴏᴋ ᴛᴜᴛᴏʀɪᴀʟ(ᴘᴄ)",
        message: "https://youtu.be/COxiy-EdXSE?si=qAy49yNtCslLyqt_"
      },
      {
        title: "ᴄᴏᴏᴋɪᴇ ʟᴏɢɪɴ (ᴀɴᴅʀᴏɪᴅ ᴍᴏʙɪʟᴇ)",
        message: "https://youtu.be/M36orZU8j4Q?si=8M0IyAB886rgE04Q"
      },
      {
        title: "ᴄᴏᴏᴋɪᴇ ʟᴏɢɪɴ (ɪᴏꜱ ᴍᴏʙɪʟᴇ)",
        message: "https://youtu.be/eP6dLhv0UKY?si=IDRwYwdAKokMVxas"
      },
      {
        title: "ᴄᴏᴏᴋɪᴇ ʟᴏɢɪɴ (ᴘᴄ)",
        message: "https://youtu.be/HsDwr3ecCSU?si=ZihNHGi8f2z1JMHO"
      },
      {
        title: "ʜᴏᴡ ᴛᴏ ᴍᴀᴋᴇ ꜰᴀᴋᴇʟɪɴᴋ ᴛᴜᴛᴏʀɪᴀʟ (ᴍᴀɪɴ ꜱɪᴛᴇ)",
        message: "**ᴛᴜᴛᴏʀɪᴀʟ ᴏɴ ʜᴏᴡ ᴛᴏ ᴍᴀᴋᴇ ꜰᴀᴋᴇʟɪɴᴋ**\n\n**ᴄʟɪᴄᴋ ᴛʜɪꜱ ᴄʜᴀɴɴᴇʟ ᴛᴏ ɢᴏ ᴛᴏ ᴛʜᴇ ꜱɪᴛᴇꜱ**\n\nhttps://discord.com/channels/1500661537415630898/1509362001980166306\n\nhttps://streamable.com/n142e2"
      }
    ];

    try {
      for (const tutorial of tutorials) {
        const thread = await message.channel.threads.create({
          name: tutorial.title
        });

        await thread.send(tutorial.message);
        console.log(`[v0] Created tutorial thread: ${tutorial.title}`);
      }

      await message.reply({
        content: "✅ All tutorial threads created successfully!",
        ephemeral: true
      });
    } catch (err) {
      console.error("[v0] Error creating tutorial threads:", err.message);
      await message.reply({
        content: `❌ Error creating threads: ${err.message}`,
        ephemeral: true
      });
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
        body: "**── ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ──**\n\n__**ʜᴏᴡ ɪᴛ ᴡᴏʀᴋꜱ**__\n- ʏᴏᴜ ɢᴏ ʟɪᴠᴇ ᴏɴ ᴛɪᴋᴛᴏᴋ ᴜꜱɪɴɢ ᴀ ꜰᴀᴋᴇ ʀᴏʙʟᴏx ɢɪᴠᴇᴀᴡᴀʏ ᴠɪᴅᴇᴏ, ᴀɴᴅ ᴛʀʏ ᴛᴏ ɢᴇᴛ ᴀꜱ ᴍᴀɴʏ ᴠɪᴇᴡᴇʀꜱ ᴀꜱ ᴘᴏꜱꜱɪʙʟᴇ. ᴀɴᴅ ʏᴏᴜ ᴡɪʟʟ ʜᴀᴠᴇ ꜰᴀᴋᴇ ʟɪɴᴋ ɪɴ ʏᴏᴜʀ ᴛɪᴋᴛᴏᴋ ʙɪᴏ ꜱᴏ ʏᴏᴜ ɢᴇᴛ ᴀᴄᴄᴏᴜɴᴛꜱ\n\n__**ʀᴇqᴜɪʀᴇᴍᴇɴᴛꜱ**__\n- ꜰᴏʀ ᴘᴄ ʟɪᴠᴇ ʏᴏᴜ ɴᴇᴇᴅ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ᴡɪᴛʜ ʟɪᴠᴇ ꜱᴛᴜᴅɪᴏ ᴀᴄᴄᴇꜱꜱ\n- ꜰᴏʀ ᴍᴏʙɪʟᴇ ʟɪᴠᴇ ʏᴏᴜ ɴᴇᴇᴅ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ᴡɪᴛʜ ᴍᴏʙɪʟᴇ ɢᴀᴍɪɴɢ ʟɪᴠᴇ ᴀᴄᴄᴇꜱꜱ\n- ᴀʟꜱᴏ ᴛʜɪꜱ ᴍᴇᴛʜᴏᴅꜱ ɴᴇᴇᴅꜱ ꜱᴏᴍᴇ ʙʀᴀɪɴ, ᴄᴀɴᴛ ʙᴇ ᴀ ʀᴇᴛᴀʀᴅ.\n\n__**ʜᴏᴡ ᴛᴏ ɢᴇᴛ ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ᴀᴄᴄ**__\n- ɢᴏ ᴛᴏ ʀᴏʙʟᴏx ᴄʀᴏꜱꜱᴛʀᴀᴅɪɴɢ ꜱᴇʀᴠᴇʀ ᴀɴᴅ ᴛʀᴀᴅᴇ ꜰᴏʀ ᴏɴᴇ\n- ᴜꜱᴇ ᴛʜɪꜱ ꜰᴏʟʟᴏᴡᴇʀ ʙᴏᴛᴛɪɴɢ ꜱᴇʀᴠɪᴄᴇ, ᴛᴏ ʙᴏᴛ 1ᴋ ꜰᴏʟʟᴏᴡᴇʀꜱ ᴏɴʟʏ ꜰᴏʀ 2$ https://yoursmm.net/\n- ᴏʀ ᴜꜱᴇ ᴛʜɪꜱ ᴍᴇᴛʜᴏᴅ ᴛᴏ ᴇᴀꜱɪʟʏ ɢᴇᴛ 1ᴋ ꜰᴏʟʟᴏᴡᴇʀꜱ ɪɴ 3 ᴅᴀʏꜱ ᴏʀ ʟᴇꜱꜱ https://justpaste.it/follow-method\n\n__**ᴄʜᴏᴏꜱɪɴɢ ʟɪɴᴋ**__\n- ɢᴏ ᴛᴏ ɪɴꜱᴀɴɪᴛʏ ꜱɪᴛᴇꜱ ᴀɴᴅ ᴛʜᴇɴ ᴘɪᴄᴋ ᴏɴᴇ ᴏꜰ ᴛʜᴇ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋꜱ\n- ᴀʟᴡᴀʏꜱ ʀᴇᴍᴇᴍʙᴇʀ ᴛᴏ ᴛᴇꜱᴛ ᴛʜᴇ ʟɪɴᴋ ʙᴇꜰᴏʀᴇ ɢᴏɪɴɢ ʟɪᴠᴇ\n- ɪꜰ ʟɪɴᴋ ɪꜱ ꜰʟᴀɢɢᴇᴅ ᴛʜᴇɴ ᴛʀʏ ʀᴇᴍᴏᴠɪɴɢ ᴛʜᴇ ᴡᴡᴡ. ᴏʀ ʜᴛᴛᴘꜱ: ꜰʀᴏᴍ ᴛʜᴇ ʟɪɴᴋ\n- ᴜꜱɪɴɢ ʙᴇᴀᴄᴏɴꜱ.ᴀɪ > ʏᴏᴜ ᴄᴀɴ ᴍᴀᴋᴇ ʙᴇᴀᴄᴏɴꜱ.ᴀɪ ʙɪᴏʟɪɴᴋ ᴛᴏ ᴍᴀᴋᴇ ɪᴛ ʟᴏᴏᴋ ᴍᴏʀᴇ ʀᴇᴀʟɪꜱᴛɪᴄ. ᴛʜɪꜱ ɪꜱ ᴍʏ ʙᴇᴀᴄᴏɴꜱ ᴀɪ https://beacons.ai/joinadoptme ʏᴏᴜ ᴄᴀɴ ᴛᴀᴋᴇ ɪɴꜱᴘɪʀᴀᴛɪᴏɴ ᴀɴᴅ ᴛʜᴇɴ ᴀᴅᴅ ɪᴛ ᴛᴏ ʏᴏᴜʀ ᴛɪᴋᴛᴏᴋ ʙɪᴏ\n- ɪꜰ ʏᴏᴜ ᴄᴀɴᴛ ᴀᴅᴅ ʟɪɴᴋ ᴛᴏ ᴛɪᴋᴛᴏᴋ ʙɪᴏ ᴛʜᴇɴ ᴍᴀᴋᴇ ʏᴏᴜʀ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ɪɴᴛᴏ ʙᴜꜱɪɴᴇꜱꜱ ᴀᴄᴄᴏᴜɴᴛ ꜱᴏ ʏᴏᴜ ᴄᴀɴ ᴀᴅᴅ ʙᴜꜱɪɴᴇꜱꜱ ʟɪɴᴋ\n\n__**ʜᴏᴡ ᴛᴏ ɢᴏ ʟɪᴠᴇ/ʟᴏᴏᴘ ᴠɪᴅᴇᴏ**__\n- ᴏɴ ᴘᴄ ʏᴏᴜ ʜᴀᴠᴇ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪᴠᴇ ꜱᴛᴜᴅɪᴏ ᴀɴᴅ ᴛʜᴇɴ ꜱᴇᴛ ɪᴛ ᴜᴘ ᴛʜᴇɴ ��ᴜꜱᴛ ᴘɪᴄᴋ ᴀ ɢᴏᴏᴅ ᴠɪᴅᴇᴏ ᴀɴᴅ ɢᴏ ʟɪᴠᴇ\n- ᴏɴ ᴍᴏʙɪʟᴇ ʏᴏᴜ ʜᴀᴠᴇ ᴛᴏ ʟᴏᴏᴘ ᴛʜᴇ ᴠɪᴅᴇᴏ ꜰʀᴏᴍ ɢᴀʟʟᴇʀʏ ꜱᴇᴛᴛɪɴɢꜱ ᴀʟᴛᴇᴀꜱᴛ ᴏɴ ᴀɴᴅʀᴏɪᴅ\n\n**__ᴍᴜꜱᴛ ʀᴇᴍᴇᴍʙᴇʀ ᴛʜᴇꜱᴇ__**\n- ᴡʜᴇɴ ʏᴏᴜ ɢᴏ ʟɪᴠᴇ ᴀʟᴡᴀʏꜱ ʀᴇᴍᴇᴍʙᴇʀ ᴛᴏ ᴍᴜᴛᴇ ʏᴏᴜʀ ᴍɪᴄ ᴄʜᴇᴄᴋ ᴛᴜᴛᴏʀɪᴀʟ ᴏɴ ʏᴛ ʜᴏᴡ ᴛᴏ.\n- ᴘᴜᴛ ɴᴏᴛɪꜰɪᴄᴀᴛɪᴏɴꜱ ᴏꜰꜰ\n- ʀᴇᴍᴇᴍʙᴇʀ ᴛᴏ ʙʟᴀᴄᴋʟɪꜱᴛ ʙᴀᴅ ᴡᴏʀᴅꜱ\n\n__**ᴘɪᴄᴋɪɴɢ ɢᴀᴍᴇ ᴄᴀᴛᴇɢᴏʀʏ ᴀɴᴅ ᴛɪᴛʟᴇ**__\n- ᴏꜰ ʏᴏᴜʀ ᴏɴ ᴍᴏʙɪʟᴇ ᴛʜᴇɴ ʏᴏᴜʀ ʟɪᴠᴇ ɢᴀᴍᴇ ᴄᴀᴛᴇɢᴏʀʏ __ᴍᴜꜱᴛ__ ʙᴇ ꜱᴜʙᴡᴀʏ ꜱᴜʀꜰᴇʀꜱ ᴏʀ ᴄʟᴀꜱʜ ʀᴏʏᴀʟᴇ. ᴏɴ ᴘᴄ ɪᴛ ᴄᴀɴ ʙᴇ ʀᴏʙʟᴏx\n- ᴛɪᴛʟᴇ ᴄᴀɴ ʙᴇ ᴘʀᴏʙᴀʙʟʏ ᴀɴʏᴛʜɪɴɢ ʙᴜᴛ ʙᴇ ᴄᴀʀᴇꜰᴜʟ ᴡɪᴛʜ ᴡᴏʀᴅꜱ ʟɪᴋᴇ ꜰʀᴇᴇ ᴀɴᴅ ɢɪᴠᴇᴀᴡᴀʏ ꜱɪɴᴄᴇ ᴛɪᴋᴛᴏᴋ ᴅᴏᴇꜱɴᴛ ᴀʟᴡᴀʏꜱ ʟɪᴋᴇ ᴛʜᴇᴍ\n\n__**ʜᴏᴡ ʟᴏɴɢ ᴛᴏ ʙᴇ ʟɪᴠᴇ ꜰᴏʀ**__\n- ɴᴇᴠᴇʀ ʙᴇ ʟɪᴠᴇ ꜰᴏʀ ᴀʟᴏᴛ ᴏꜰ ʜᴏᴜʀꜱ ᴜɴʟᴇꜱꜱ ʏᴏᴜʀ ʟɪᴠᴇ ɪꜱ ꜱᴛᴀʙʟᴇ ᴀꜱꜰ. ʟɪᴋᴇ ʜᴀᴠɪɴɢ ᴀʙᴛ ʜᴜɴᴅʀᴇᴅ ᴠɪᴇᴡᴇʀꜱ ᴏʀ ᴍᴏʀᴇ ꜰᴏʀ ʜᴏᴜʀꜱ.\n- ᴡʜᴇɴ ʏᴏᴜ ꜱᴛᴀʀᴛ ʟɪᴠᴇ ʏᴏᴜ ꜱʜᴏᴜʟᴅ ᴅᴏ ɪᴛ ᴏɴʟʏ ꜰᴏʀ 20 ᴍɪɴꜱ ᴀɴᴅ ᴛʜᴇɴ ᴄʜᴇᴄᴋ ᴛᴏ ɪꜰ ᴇɴᴅ ᴛʜᴇ ʟɪᴠᴇ ᴏʀ ɴᴏᴛ.\n\n__**ʜᴇʀᴇꜱ ᴡʜᴇɴ ᴛᴏ ᴇɴᴅ ᴀɴᴅ ᴡʜᴇɴ ᴛᴏ ɴᴏᴛ ᴛᴏ**__\n- ɪꜰ ᴀꜰᴛᴇʀ 20 ᴍɪɴꜱ ʏᴏᴜʀ ᴠɪᴇᴡᴇʀꜱ ᴀʀᴇ ʙᴇʟᴏᴡ 10 ᴛʜᴇɴ ᴇɴᴅ ʏᴏᴜʀ ʟɪᴠᴇ\n- ɪꜰ ᴛʜᴇʏʀᴇ ᴀʙᴏᴠᴇ 10 ᴛʜᴇɴ ʜᴇʀᴇꜱ ꜱᴍᴀʟʟ ᴄʜᴀɴᴄᴇ ᴏꜰ ɢᴏɪɴɢ ᴠɪʀᴀʟ\n- ᴀʙᴏᴠᴇ 20 ᴠɪᴇᴡᴇʀꜱ = ɢᴏᴏᴅ ᴄʜᴀɴᴄᴇ ᴛᴏ ɢᴏ ᴠɪʀᴀʟ\n- ᴀʙᴏᴠᴇ 40 ᴠɪᴇᴡᴇʀꜱ ɪꜱ ᴠᴇʀʏ ɢᴏᴏᴅ ᴋᴇᴇᴘ ɪᴛ ᴜᴘ ᴜɴᴛɪʟ ᴛʜᴇʏ ꜱᴛᴀʀᴛ ᴅʀᴏᴘᴘɪɴɢ!!\n\n**__ᴘᴜᴍᴘɪɴɢ ᴍᴇᴛʜᴏᴅ__**\nᴛʜɪꜱ ɪꜱ ᴀ ᴍᴇᴛʜᴏᴅ ᴛᴏ ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ɢʀᴏᴡ ᴠɪᴇᴡᴇʀꜱ.\n- ʙᴀꜱɪᴄᴀʟʟʏ ᴊᴜꜱᴛ ɢᴏ ʟɪᴠᴇ ᴜɴᴛɪʟ ᴠɪᴇᴡᴇʀꜱ ɢʀᴏᴡ ᴀɴᴅ ᴡʜᴇɴ ᴛʜᴡʏ ᴅʀᴏᴘ ʙʏ ᴀ ʙɪᴛ ᴊᴜꜱᴛ ᴇɴᴅ ᴛʜᴇ ʟɪᴠᴇ ɪᴍᴍᴇᴅɪᴀᴛᴇʟʟʏ > ᴀɴᴅ ᴛʜᴇɴ ꜱᴛᴀʀᴛ ʟɪᴠᴇ ᴀʟᴍᴏꜱᴛ ɪᴍᴍᴇᴅɪᴀʟʟʏ ᴀɢᴀɪɴ ᴀɴᴅ ʀᴇᴘᴇᴀᴛ ᴛʜɪꜱ ᴜɴᴛɪʟ ʏᴏᴜ ʜᴀᴠᴇ ꜱᴛᴀʙʟᴇ ᴀꜱꜰ ʟɪᴠᴇ ᴡɪᴛʜ ʜᴜɴᴅʀᴇᴅꜱ ᴏꜰ ᴠɪᴇᴡᴇʀꜱ!!!\n\n**ʜᴇʀᴇꜱ ꜱᴏᴍᴇ ʀᴀɴᴅᴏᴍ ᴛᴜᴛᴏʀɪᴀʟ ᴠɪᴅꜱ ɪ ꜰᴏᴜɴᴅ ʏᴏᴜ ᴄᴀɴ ᴡᴀᴛᴄʜ ᴛᴏ ʟᴇᴀʀɴ, __ᴍᴜꜱᴛ__ ꜱᴛɪʟʟ ʀᴇᴀᴅ ꜰᴜʟʟ ᴛᴇxᴛ ᴏᴛʜᴇʀᴡɪꜱᴇ ʏᴏᴜ ᴡᴏɴᴛ ɢᴇᴛ ᴠɪᴇᴡᴇʀꜱ 😐**\nhttps://youtu.be/B-zZHryfuTs?si=XmrEatq2l3nyd0UP\nhttps://www.youtube.com/watch?v=RGaJMb7bRq8&t=1s"
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
        body: "**── ᴅᴜᴀʟʜᴏᴏᴋ ᴍᴇᴛʜ ──**\n\n**ꜱᴛᴇᴘ 1: ᴄʀᴇᴀᴛᴇ ᴀ ꜱᴇʀᴠᴇʀ & ᴛʜᴇ ᴅᴜᴀʟʜᴏᴏᴋ ʟɪɴᴋ ɪɴ ᴛʜᴇ ᴡᴇʙꜱɪᴛᴇ ᴡʜᴇʀᴇ ʏᴏᴜ ᴀʀᴇ ᴛᴇᴀᴄʜɪɴɢ ᴍᴇᴍʙᴇʀꜱ ʜᴏᴡ ᴛᴏ ɢᴇᴛ ʜɪᴛꜱ ᴀᴛ ᴛʜᴇ ꜱᴀᴍᴇ ᴛɪᴍᴇ, ʏᴏᴜ'ʟʟ ʙᴇ ꜱᴛᴇᴀʟɪɴɢ ᴛʜᴇɪʀ ʜɪᴛꜱ**\n\n**ꜱᴛᴇᴘ 2: ʜᴇᴀᴅ ᴏᴠᴇʀ ᴛᴏ**\nhttps://discord.com/template/Cg2G6AdH6ZkR\n**ᴅᴏᴇꜱɴᴛ ʜᴀᴠᴇ ᴛᴏ ʙᴇ ᴇxᴀᴄᴛʟʏ ʟɪᴋᴇ ᴛʜᴀᴛ ʙᴜᴛ, ɪᴛ ᴅᴏᴇꜱ ʜᴀᴠᴇ ᴛᴏ ʜᴀᴠᴇ ᴛʜᴇ ꜱᴇʀᴠᴇʀ ᴀꜱᴘᴇᴄᴛꜱ.**\n\n**ꜱᴛᴇᴘ 3: ᴏɴᴄᴇ ʏᴏᴜ ꜰɪɴɪꜱʜᴇᴅ ᴡɪᴛʜ ʏᴏᴜʀ ᴡʜᴏʟᴇ ꜱᴇʀᴠᴇʀ ᴀɴᴅ ᴅᴏɴᴇ ᴡɪᴛʜ ɪᴛ, ᴛʀʏ ᴛᴏ ᴘᴀʀᴛɴᴇʀ ᴡɪᴛʜ ᴀꜱ ᴍᴀɴʏ ꜱᴇʀᴠᴇʀꜱ ᴀꜱ ʏᴏᴜ ᴄᴀɴ, ɪɴᴠɪᴛᴇ ʏᴏᴜʀ ꜰʀɪᴇɴᴅꜱ, ᴀɴᴅ ᴇᴠᴇɴ ꜱᴛᴇᴀʟ ᴍᴇᴍʙᴇʀꜱ ᴏᴜᴛ ᴏꜰ ᴅɪꜰꜰᴇʀᴇɴᴛ ꜱᴇʀᴠᴇʀꜱ ꜱᴇᴄʀᴇᴛʟʏ**\n\n**ꜱᴛᴇᴘ 4: ʏᴏᴜ ᴅᴏ ᴡᴀɴᴛ ᴛᴏ ʜᴀᴠᴇ ʏᴏᴜʀ ꜱᴇʀᴠᴇʀ ᴀᴄᴛɪᴠᴇ, ᴀᴅᴅ ᴍᴏᴅꜱ, ᴀᴅᴍɪɴꜱ, ᴀɴᴅ ᴍᴀʏʙᴇ ᴇᴠᴇɴ ᴀ ᴄᴏ-ᴏᴡɴᴇʀ!!**\n\n**ᴛᴜᴛᴏʀɪᴀʟ:**\nhttps://streamable.com/u88d7u"
      },
      {
        name: "ᴛɪᴋᴛᴏᴋ ɴᴏᴛ ʟɪᴠᴇ",
        image1: "https://cdn.discordapp.com/attachments/1506434367491276812/1509399153321443388/image0_1.gif?ex=6a190901&is=6a17b781&hm=8d73fe9824d744a19022718c65a469779f8e8f9f86e82a0b5fda2f9010d9da5a",
        image2: "https://cdn.discordapp.com/attachments/1506434367491276812/1509394265141415936/1773637630733-5bee7763-8a95-48c0-8857-b9f2196e8d11.gif?ex=6a190473&is=6a17b2f3&hm=2866b7b7ca9eff6d39f1ccbc30640a1ee0fa62adac8619771cf9d455c329a76b",
        body: "**── ᴛɪᴋᴛᴏᴋ (ɴᴏᴛ ʟɪᴠᴇ) ᴍᴇᴛʜ ──**\n\n**ᴄʀᴇᴀᴛᴇ ᴀɴ ᴛɪᴋᴛᴏᴋ ᴀᴄᴄᴏᴜɴᴛ ʀᴇʟᴀᴛᴇᴅ ᴛᴏ ᴛʜᴇ ɢᴀᴍᴇ ʏᴏᴜ ᴡᴀɴᴛ**\n\n**ᴄʜᴀɴɢᴇ ʏᴏᴜʀ ᴀᴄᴄᴏᴜɴᴛ ɪɴᴛᴏ ᴀ ʙᴜꜱɪɴᴇꜱꜱ ᴀᴄᴄ ꜱᴏ ʏᴏᴜ ᴄᴀɴ ᴘᴜᴛ ʟɪɴᴋꜱ ᴏɴ ʏᴏᴜʀ ʙɪᴏ**\n\n**ᴇɴᴊᴏʏ, ɴᴏ ɴᴇᴇᴅ ᴛᴏ ʟɪᴠᴇꜱᴛʀᴇᴀᴍ**\n\nhttps://cdn.discordapp.com/attachments/1277482286232637544/1284084370898157578/lv_0_20240831184505.mp4?ex=673866c3&is=67371543&hm=95ece82de1fe102a7b89611da3f3915dc4baa2c94a5c9dc86545c8283c8d750f"
      },
      {
        name: "ʀᴏʟɪᴍᴏɴꜱ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "HOW TO GET A LIMITED ROBLOX? THIS IS MY OLD METHOD\n> Install this on your website: https://chromewebstore.google.com/detail/ropro-enhance-your-roblox/adbacgifemdbhdkfppmeilbgppmhaobf\n\n> Visit this link: https://www.rolimons.com/trades and find the people you want to trade with.\n\nGo to the Roblox profiles of the people you want to trade with and find Discord. You can add them and create a message like \"trading with SSHF, Valk, or anything else.\""
      },
      {
        name: "ᴛɪᴋᴛᴏᴋ ʀᴇᴘʟʏ ᴄᴏᴍᴍᴇɴᴛꜱ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nReply to TT Comments Method\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nStep 1: Create a link — if you don't know how, check the tutorials\n\nStep 2: Add the link to your TikTok bio\n\nStep 3: Reply to comments with:\n\n> IF YOU SEE THIS YOU CAN GET FREE PERM/GAME PASSES WITH THE LINK IN MY TIKTOK BIO\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nAlternative Link Hiders:\n• https://linktr.ee/512f6\n• https://linktr.ee/\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nNote:\nIn some countries you can't create links — try using a VPN\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCreate TikTok account with temp mail:\nhttps://temp-mail.org/uk\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      },
      {
        name: "ʙꜱꜱ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nBSS VERY OP METHOD (TWO ACCOUNT WITH 18-20 HIVES PER DAY)\n\n1. Go to https://bssmvalues.com/\n\n2. Look for rich people, give them a good overpay and tell them to add you on Discord\n\n3. Once on Discord, say: \"Just join my private server to trade\" — then send the fake link\n\n4. Get their account and stuff\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nBSS TRADING SERVERS:\n\nhttps://discord.gg/swWaqafh4B\nhttps://discord.com/invite/bssm\nhttps://discord.com/invite/bsstrades-1213173775366094909\nhttps://discord.com/servers/bee-swarm-simulator-trading-server-1179032518444462090\nhttps://discord.com/invite/bee-swarm-simulator-values-1196133860245778462\nhttps://discord.com/invite/uaRUqUbuy7\nhttps://discord.com/invite/bee\nhttps://discord.com/invite/bss-helping-809858765141835786\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nEasy hits — don't sleep on this!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      },
      {
        name: "ᴅᴀʜ�����ᴏᴅ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nDAHOOD OP METHOD (2 korblox per day)\n\n1. Find very rich people on server (with funny or dumb skin)\n\n2. For example, he has Heaven Knife skin — say: \"Did you get Heaven Knife?\"\n\n3. Victim says: \"Yes I do\"\n\n4. Say: \"My friend can give you a sword that is twice as expensive\"\n\n5. He agrees — tell him he needs to add your friend on Discord\n\n6. He adds you on Discord — start a normal dialogue about the trade\n\n7. Then send a fake link and get very expensive items + the account\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nEasy Korblox — just play it cool!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      },
      {
        name: "qʀ ᴄᴏᴅᴇ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "QR CODE SCAM METHOD\n\nFirst, you need to create the QR code. Go to Roblox, take a screenshot of an actual QR code (find where it is located in the settings).\n\nThen, visit the website qr.io and insert your bait link (the link to your fake Roblox profile) there.\n\nUsing Photopea, replace the original Roblox QR code with your bait QR code on the screenshot, and you're all set.\n\nTutorial: https://www.youtube.com/watch?v=mhvWkLu4OHo\nPhotopea: https://www.photopea.com/\nScreenshot Tool: https://app.prntscr.com/en/index.html"
      },
      {
        name: "ᴍᴀɴɪᴘᴜʟᴀᴛɪᴏɴ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "Simple but very effective method:\n\nHow it works:\n→ Once you've hitted someone using other methods\n→ Tell them you will give their account back\n→ Keep your personal hitter\n→ When they beam an account, tell them the victim didn't login\n→ They'll hit even more accounts\n→ Continue this cycle and collect all the accounts\n\nKey: Make them think their hiting isn't working so they try harder!"
      },
      {
        name: "ʙᴜʏɪɴɢ ᴀɴᴅ ꜱᴇʟʟɪɴɢ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "Requirements:\n• PC (won't work on mobile - can't hide domain)\n\nMethod:\n→ Go to Discord Roblox selling servers\n→ Find an account you want to hit\n→ Act like you're going to buy and ask to login to check it\n→ Say: I'll do it on stream if you don't let me\n→ They'll usually allow it\n\nHiding the Domain:\n⚠️ The top will say: Roblox.ml - we don't want this!\n→ Click on the address bar\n→ Type: roblox.com/login\n→ Don't hit enter, just leave it there\n→ Now proceed to login\n\nIf they have PIN:\n→ Ask them for the PIN\n→ Tell them: I can't do anything bad because you have 2FA\n→ When they give it, the system automatically cracks it\n→ It will change the PIN to your entered PIN\n\nWhat to say:\n\"Umm, is there any way I can login to the account on screenshare? I won't go in-game, just stay on homescreen. Once I'm in, give me 20s to send the money\"\n\nServers to hit in:\n• https://discord.gg/Jq2YTzWtKA\n• https://discord.gg/DN92bfYThS"
      },
      {
        name: "ʀᴀɴᴅᴏᴍ ᴍᴇᴛʜᴏᴅ",
        plainText: true,
        body: "https://pastebin.com/raw/kJVTvig0\nhttps://pastebin.com/uud4m5KU\nhttps://pastebin.com/Yi9jKTvt\nhttps://pastebin.com/RdnbMsxe\nhttps://pastebin.com/LDpi2uqv\nhttps://pastebin.com/RNwVVZHA\nhttps://pastebin.com/ATV0TwPK\nhttps://pastebin.com/SRKrnn0R\nhttps://pastebin.com/77jVLKrg\nhttps://pastebin.com/cWZEb4sQ\nhttps://pastebin.com/Mv2jbKZA\nhttps://pastebin.com/ddLppdjn\nhttps://pastebin.com/4mZcU16i\nhttps://pastebin.com/ijbp6v09\nhttps://pastebin.com/MKjLjJQLT"
      }
    ];
    
    // Create threads for replays
    const replaysThread = await message.channel.threads.create({
      name: "ᴛɪᴋᴛᴏᴋ ʟɪᴠᴇ ʀᴇᴘʟᴀʏꜱ"
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
        name: method.name
      });

        // Check if this is a plain text method or embed method
        if (method.plainText) {
          // Send plain text message for method guides
          await thread.send(method.body);
        } else {
          // Send embeds for traditional methods
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
        }
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

      const purgeChannelNames = ["���⌇・ᴄᴏᴍᴍᴀɴᴅꜱ", "🗨️⌇・ᴄʜᴀᴛ", "💸⌇・ꜰʟᴇx𓏵ᴛʀᴀᴅᴇ"];
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

  // ── !websites ──
  if (content === `${PREFIX}websites`) {
    const websitesEmbed = new EmbedBuilder()
      .setDescription(
        "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ  | ꜱɪᴛᴇꜱ` <a:emoji_8:1506236357775720548> ───\n\n" +
        "<a:emoji_13:1508646379751342130> 1 ᴄᴜʀʀᴇɴᴛ ᴀᴄᴛɪᴠᴇ ᴅᴏᴍᴀɪɴ\n\n" +
        "<:emoji_14:1508646444607864872> ʙʟᴀᴢɪɴɢ ꜰᴀꜱᴛ & ꜰᴇᴀᴛᴜʀᴇ ʟᴏᴀᴅᴇᴅ ꜱɪᴛᴇꜱ**"
      )
      .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
      .setThumbnail("https://cdn.discordapp.com/attachments/1506434367491276812/1509385290362519693/bonsai-discord_1.gif?ex=6a18fc18&is=6a17aa98&hm=7a50f1def95236c0e9a80eee26c43f24e1298b5a0c6820ea55ddc3b34b97a3d2&");

    const websitesRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL("https://discord.com/oauth2/authorize?client_id=1443059700311527586&redirect_uri=https://www.logged.tg/api/auth&response_type=code&scope=identify&prompt=none&state=eyJyZWZlcnJhbCI6ImFwaSIsIl9fTE9DQUxfUEFTU0VEIjp7Il9fSU5JVElBTF9VUkwiOiJodHRwczovL3d3dy5sb2dnZWQudGcvYXV0aC9hcGkiLCJfX1JFRElSRUNUX1VSTCI6Imh0dHBzOi8vd3d3LmxvZ2dlZC50Zy9kYXNoYm9hcmQiLCJfX0NBTExCQUNLX1VSTCI6Imh0dHBzOi8vd3d3LmxvZ2dlZC50Zy9hcGkvYXV0aCIsIl9fU1dBUF9IT1NUIjoid3d3LmxvZ2dlZC50ZyJ9fQ==")
        .setLabel("ᴅᴀꜱʜʙᴏᴀʀᴅ")
        .setStyle(ButtonStyle.Link)
        .setEmoji({ id: "1508646379751342130", name: "emoji_13", animated: true })
    );

    await message.channel.send({ embeds: [websitesEmbed], components: [websitesRow] });
    return;
  }

  // ── !tools ──
  if (content === `${PREFIX}tools`) {
    const toolsEmbed = new EmbedBuilder()
      .setDescription(
        "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ  | ᴛᴏᴏʟꜱ` <a:emoji_8:1506236357775720548> ───\n\n" +
        "<a:emoji_13:1508646379751342130> 1 ᴄᴜʀʀᴇɴᴛ ᴀᴄᴛɪᴠᴇ ᴅᴏᴍᴀɪɴ\n\n" +
        "<:emoji_14:1508646444607864872> ʙʟᴀᴢɪɴɢ ꜰᴀꜱᴛ & ꜰᴇᴀᴛᴜʀᴇ ʟᴏᴀᴅᴇᴅ ꜱɪᴛᴇꜱ**"
      )
      .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
      .setThumbnail("https://cdn.discordapp.com/attachments/1506434367491276812/1509385290362519693/bonsai-discord_1.gif?ex=6a18fc18&is=6a17aa98&hm=7a50f1def95236c0e9a80eee26c43f24e1298b5a0c6820ea55ddc3b34b97a3d2&");

    const toolsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL("https://refresher.fwh.is/?i=1")
        .setLabel("ᴄᴏᴏᴋɪᴇ ʀᴇꜰʀᴇꜱʜᴇʀ")
        .setStyle(ButtonStyle.Link)
        .setEmoji({ id: "1508646379751342130", name: "emoji_13", animated: true }),
      new ButtonBuilder()
        .setURL("https://linkurlshort.page.gd/")
        .setLabel("ʜʏᴘᴇʀʟɪɴᴋ")
        .setStyle(ButtonStyle.Link)
        .setEmoji({ id: "1508646379751342130", name: "emoji_13", animated: true }),
      new ButtonBuilder()
        .setURL("https://www.rbxbypass.com/")
        .setLabel("ʙʏᴘᴀꜱꜱᴇʀ")
        .setStyle(ButtonStyle.Link)
        .setEmoji({ id: "1508646379751342130", name: "emoji_13", animated: true })
    );

    await message.channel.send({ embeds: [toolsEmbed], components: [toolsRow] });
    return;
  }

  // ── !verifyme ──
  if (content === `${PREFIX}verifyme`) {
    const verifyEmbed = new EmbedBuilder()
      .setDescription(
        "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ | ᴠᴇʀɪꜰʏ` <a:emoji_8:1506236357775720548> ───\n\n" +
        "<a:emoji_13:1508646379751342130> ʙᴇꜱᴛ ʙᴇᴀᴍɪɴɢ ꜱᴇʀᴠᴇʀ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ\n\n" +
        "<:emoji_14:1508646444607864872> ᴄʟɪᴄᴋ ᴠᴇʀɪꜰʏ ʙᴇʟᴏᴡ ᴛᴏ ɢᴇᴛ <@&1506114487185440819> ʀᴏʟᴇ**"
      )
      .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
      .setThumbnail("https://cdn.discordapp.com/attachments/1506434367491276812/1509385290362519693/bonsai-discord_1.gif?ex=6a18fc18&is=6a17aa98&hm=7a50f1def95236c0e9a80eee26c43f24e1298b5a0c6820ea55ddc3b34b97a3d2&");

    const verifyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL("https://discord.com/oauth2/authorize?client_id=1502865967766568970&redirect_uri=https://restorecord.com/api/callback&response_type=code&scope=identify+guilds.join&state=1500661537415630898&prompt=none")
        .setLabel("ꜱᴛᴀʀᴛ ᴠᴇʀɪꜰʏ")
        .setStyle(ButtonStyle.Link)
        .setEmoji({ id: "1508646493169647657", name: "emoji_15", animated: true })
    );

    await message.channel.send({ embeds: [verifyEmbed], components: [verifyRow] });
    return;
  }

  // ── !stats [@user] ──
  if (content.startsWith(`${PREFIX}stats`)) {
    try {
      const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

      // Get mentioned user or use author
      let targetUser = message.author;
      const mention = message.mentions.first();
      if (mention) {
        targetUser = mention;
      }

      const username = targetUser.username;
      
      console.log("[v0] Searching for stats of:", username);

      // Search for user stats using the search endpoint
      const statsRes = await fetch(`https://api.injuries.to/v2/controller/partial/search?name=${encodeURIComponent(username)}`, {
        method: "GET",
        headers: {
          "x-id": "62133",
          "x-token": "Y01XbWgvUWxickkwSUNCUWlqTERtZnF3dGlKeXkyWjVQaFlJSSsra1RxckxiTW55YTZkNW9JRWIxZzZDaG4yaXNSbXkzcURNZ0xkWTE4eGxNdm42NXhHbWxZeFNWWUlvL3NXbk9vcHJkbWQXN3d1bU1jcEJ4NnkvUHIWV0hjTGw1NVBtTG5HTk53bHF1aHY5TG9VdGJvbDMyWVIDa0Jpamx3d1NxdFNhenEyQnRyR2p3dHIMUU01OGdmTC9aWWM2N3FVLzVUFRKa1RuRWhDSzBjTHBHR2RFYmdjSUFVSmZMNnlZdkhVa0JDTzZ4N2ZqRDRtRDI3eU5HeDVCS1ZlaFVwZzVQVzRuUXRNVG1YQUlLcG1COXVxWnBqQzFNTks1NkZEOClsREVpaHVmOFp3alZwT1VBMXk4akIXZVILWGczRFZYbDBHKzFXZzIxVW1MdHRJVjcrOU9iM3NxSjdpK2x2Sm5IVlhuRlJWaWpyVWQxQjVxL3puTGtBRlhodFlZMlAxd3d2WlEvbUx5WXBZRDVGTjNXdUdlOFhtODVHNWVSVWtaSno0dytkN04rUXMvQ1NUQmVScmM3dUpZWmInUk4yYU5aVVNnRnB6Zm1XTUUrSC9P",
        },
      });

      if (!statsRes.ok) {
        console.log("[v0] Stats API error. Status:", statsRes.status);
        const errorText = await statsRes.text();
        console.log("[v0] Stats API error response:", errorText);
        await message.reply({
          content: `<:emoji_11:1506864561435967509> User **${username}** not found in the stats database.`,
        });
        return;
      }

      const userData = await statsRes.json();
      console.log("[v0] User stats received:", JSON.stringify(userData).substring(0, 500));

      if (!userData || Object.keys(userData).length === 0) {
        await message.reply({
          content: `<:emoji_11:1506864561435967509> User **${username}** not found in the stats database.`,
        });
        return;
      }

      // Build stats embed
      const statsEmbed = new EmbedBuilder()
        .setTitle(`<a:emoji_8:1506236357775720548> User Statistics - ${userData.rootName || username}`)
        .setColor(0xFF6B00)
        .setDescription(`**Detailed Stats for ${userData.rootName || username}**`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          {
            name: "Visits",
            value: (userData.visits || 0).toLocaleString(),
            inline: true,
          },
          {
            name: "Accounts",
            value: (userData.accounts || 0).toLocaleString(),
            inline: true,
          },
          {
            name: "RAP",
            value: (userData.rap || 0).toLocaleString(),
            inline: true,
          },
          {
            name: "Balance",
            value: (userData.balance || 0).toLocaleString(),
            inline: true,
          },
          {
            name: "Summary",
            value: userData.summary ? (userData.summary).toLocaleString() : "N/A",
            inline: true,
          },
          {
            name: "Clicks",
            value: (userData.clicks || 0).toLocaleString(),
            inline: true,
          }
        )
        .setFooter({
          text: `Requested by ${message.author.username}`,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        });

      await message.reply({ embeds: [statsEmbed] });
    } catch (err) {
      console.error("[bot] stats error:", err.message);
      await message.reply({
        content: "<:emoji_11:1506864561435967509> Failed to fetch statistics. Please try again later.",
      });
    }
    return;
  }

  // ── !daily ──
  if (content === `${PREFIX}daily`) {
    try {
      const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

      // Fetch daily stats from injuries.to API
      const dailyRes = await fetch("https://api.injuries.to/v2/daily", {
        method: "GET",
        headers: {
          "x-id": "64874",
          "x-token": "Y01XbWgvUWxickl3TGloV2h6ZkFuZjIzdVNweHlHOStQaEVJSSsra1RxckxiTW55YTZkNW9OTmYzeE9NazJqdTZGeXkyNnFnemZsZzRjSnFOcmVmcXhhcWlzdEtXODB0N1pEeGQ5b29PaVE1NmtHelBOcEd3UDIwT0NOVkZJaTR0TUt3SzNYZU1RNHd0ay84S2RVcWJaOWl5TVpEd0Z2OWwwVkZrODJrdlBDZDFPM0UxZFdDTmVNUWxzYlBIWVZLNjlNNjJoWFljVXk0RDFMd2g3SERRQmQxR3hzVEVVSnNLYjMweW04dEVBNzdvdHZGZW9rTDU2WDlGMmcwSlRqblE4bEpIQVVwUnV3Ym9CZ0tKYWp6enQ2ZWhsQzVQYnFTcUFQQWhIQ3YzQnFjZ0tsSkZyMkNZbkdxOTV1TUlzdmdtR0kwbDFENnlqY29peFBxNE1VMjcvWVREQ2txT3FLMDZMb0JRQ3pITVdvbno1RjBqaDljemhMR3QwRktzZmM1emY0NHNveE00WEg0WjdjUmpWTVNiSnZiaENhVDdWZ1NlV0lVY3hvdTRwbkFyVlo1RERYRmFGNmJzYlJOWWpWV2Z1UGJNQVMzR0pYUmwyVUY4SFdFUUdqWVU0d1g=",
          "Content-Type": "application/json",
        },
      });

      if (!dailyRes.ok) {
        console.log("[v0] Daily API error. Status:", dailyRes.status);
        const errorText = await dailyRes.text();
        console.log("[v0] Daily API error details:", errorText);
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Failed to fetch daily stats. Please try again later.",
        });
        return;
      }

      const dailyData = await dailyRes.json();
      console.log("[v0] Daily data received:", JSON.stringify(dailyData).substring(0, 800));

      // Build daily embed - handle the response from injuries.to API which returns top 3 hitters
      const topHitters = Array.isArray(dailyData) ? dailyData : (dailyData.topUsers || dailyData.top_users || dailyData.data || dailyData.results || []);
      
      // Try to fetch Discord user info for each hitter
      const enrichedHitters = await Promise.all(
        topHitters.slice(0, 3).map(async (user, index) => {
          try {
            // Try to get Discord user by their Roblox username or ID
            const discordUser = await client.users.fetch(user.discord_id || user.discordId).catch(() => null);
            return {
              ...user,
              discordUser: discordUser,
              position: index + 1,
              displayName: user.name || user.username || user.user || "Unknown",
              hits: user.hits || user.hit_count || user.hitCount || 0,
            };
          } catch (e) {
            return {
              ...user,
              discordUser: null,
              position: index + 1,
              displayName: user.name || user.username || user.user || "Unknown",
              hits: user.hits || user.hit_count || user.hitCount || 0,
            };
          }
        })
      );

      // Create fields for each hitter with medals/rankings
      const medals = ["🥇", "🥈", "🥉"];
      const fields = enrichedHitters.map((user, index) => {
        const medal = medals[index] || "⭐";
        const username = user.discordUser ? `${user.discordUser.username}` : user.displayName;
        const hitCount = user.hits.toLocaleString();
        
        return {
          name: `${medal} #${user.position} - ${username}`,
          value: `<a:emoji_13:1508646379751342130> **${hitCount}** Hits`,
          inline: false,
        };
      });

      const dailyEmbed = new EmbedBuilder()
        .setTitle(`<a:emoji_8:1506236357775720548> Daily Top 3 Hitters`)
        .setColor(0xFF6B00)
        .setDescription("**Today's top 3 hitters across the global network** <a:emoji_8:1506236357775720548>\n\n*Powered by injuries.to*")
        .setFields(...fields)
        .setThumbnail(enrichedHitters[0]?.discordUser?.displayAvatarURL({ dynamic: true }) || "https://cdn.discordapp.com/attachments/1506434367491276812/1509385290362519693/bonsai-discord_1.gif?ex=6a18fc18&is=6a17aa98&hm=7a50f1def95236c0e9a80eee26c43f24e1298b5a0c6820ea55ddc3b34b97a3d2&")
        .setImage("https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif")
        .setFooter({
          text: `Updated: ${new Date().toLocaleString("en-US", { timeZone: "UTC" })} UTC`,
          iconURL: "https://cdn.discordapp.com/attachments/1506434367491276812/1509385290362519693/bonsai-discord_1.gif?ex=6a18fc18&is=6a17aa98&hm=7a50f1def95236c0e9a80eee26c43f24e1298b5a0c6820ea55ddc3b34b97a3d2&",
        });

      await message.reply({ embeds: [dailyEmbed] });
    } catch (err) {
      console.error("[bot] daily error:", err.message);
      await message.reply({
        content: "<:emoji_11:1506864561435967509> Failed to fetch daily statistics. Please try again later.",
      });
    }
    return;
  }

  // ── !dm ──
  if (content.startsWith(`${PREFIX}dm`)) {
    // Check if user has administrator permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({
        content: "<:emoji_11:1506864561435967509> You need administrator permissions to use this command.",
        ephemeral: true,
      });
      return;
    }

    try {
      // Parse the command: !dm @user message
      const args = content.slice(PREFIX.length + 2).trim().split(" ");
      
      if (args.length < 2) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Usage: `!dm @user <message>`",
          ephemeral: true,
        });
        return;
      }

      // Get the mentioned user
      const userMention = args[0];
      const dmMessage = args.slice(1).join(" ");

      // Parse mention to get user ID
      const userId = userMention.replace(/[<@!>]/g, "");
      
      if (!userId || isNaN(userId)) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Please mention a valid user. Usage: `!dm @user <message>`",
          ephemeral: true,
        });
        return;
      }

      // Fetch the user
      const targetUser = await client.users.fetch(userId);
      
      if (!targetUser) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> User not found.",
          ephemeral: true,
        });
        return;
      }

      // Send the DM
      await targetUser.send(dmMessage);
      
      await message.reply({
        content: `<a:emoji_13:1508646379751342130> Message sent to ${targetUser.username}!`,
        ephemeral: true,
      });

      console.log(`[v0] DM sent to ${targetUser.username} (${userId}) by ${message.author.username}: ${dmMessage}`);
    } catch (err) {
      console.error("[bot] dm error:", err.message);
      await message.reply({
        content: "<:emoji_11:1506864561435967509> Failed to send DM. Make sure the user has DMs enabled.",
        ephemeral: true,
      });
    }
    return;
  }

  // ── !announce ──
  if (content.startsWith(`${PREFIX}announce`)) {
    // Check if user has administrator permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({
        content: "<:emoji_11:1506864561435967509> You need administrator permissions to use this command.",
      });
      return;
    }

    try {
      // Parse the command: !announce message
      const announceMessage = content.slice(PREFIX.length + 8).trim();

      if (!announceMessage) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Usage: `!announce <message>`",
        });
        return;
      }

      // Send the announcement to the channel
      await message.channel.send(announceMessage);

      // Delete the user's command message
      await message.delete();

      console.log(`[v0] Announcement sent by ${message.author.username}: ${announceMessage}`);
    } catch (err) {
      console.error("[bot] announce error:", err.message);
      await message.reply({
        content: "<:emoji_11:1506864561435967509> Failed to send announcement.",
      });
    }
    return;
  }

  // ── !ban ──
  if (content.startsWith(`${PREFIX}ban`)) {
    // Check if user has administrator permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({
        content: "<:emoji_11:1506864561435967509> You need administrator permissions to use this command.",
      });
      return;
    }

    try {
      // Parse the command: !ban @user [reason]
      const args = content.slice(PREFIX.length + 3).trim().split(" ");
      
      if (args.length < 1) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Usage: `!ban @user [reason]`",
        });
        return;
      }

      const userMention = args[0];
      const banReason = args.slice(1).join(" ") || "No reason provided";

      // Parse mention to get user ID
      const userId = userMention.replace(/[<@!>]/g, "");
      
      if (!userId || isNaN(userId)) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Please mention a valid user. Usage: `!ban @user [reason]`",
        });
        return;
      }

      // Get user info to display in response
      const targetUser = await client.users.fetch(userId).catch(() => null);
      
      if (!targetUser) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> User not found.",
        });
        return;
      }

      // Ban the user
      try {
        await message.guild.bans.create(userId, { reason: banReason });
      } catch (err) {
        await message.reply({
          content: "<:emoji_11:1506864561435967509> Failed to ban user. Make sure they're in the server and I have ban permissions.",
        });
        throw err;
      }

      await message.reply({
        content: `<a:emoji_13:1508646379751342130> Successfully banned ${targetUser.username}. Reason: ${banReason}`,
      });

      console.log(`[v0] User ${targetUser.username} (${userId}) banned by ${message.author.username}. Reason: ${banReason}`);
    } catch (err) {
      console.error("[bot] ban error:", err.message);
      await message.reply({
        content: "<:emoji_11:1506864561435967509> Failed to ban user.",
      });
    }
    return;
  }

  // ── !purge ──
  if (content.startsWith(`${PREFIX}purge`)) {
    // Check if user has administrator permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({
        content: "<:emoji_11:1506864561435967509> You need administrator permissions to use this command.",
      });
      return;
    }

    try {
      // Parse the command: !purge [amount]
      const args = content.slice(PREFIX.length + 5).trim();
      let amount = args ? parseInt(args) : 100;

      // Validate amount
      if (isNaN(amount) || amount < 1) {
        amount = 100;
      }

      // Cap at 1000 messages
      if (amount > 1000) {
        amount = 1000;
      }

      // Fetch and delete messages
      let allMessages = [];
      let lastId = undefined;
      let fetchedCount = 0;

      // Fetch all messages up to the amount specified
      while (fetchedCount < amount) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const messages = await message.channel.messages.fetch(fetchOptions);
        if (messages.size === 0) break;

        allMessages = allMessages.concat(Array.from(messages.values()));
        lastId = messages.last().id;
        fetchedCount += messages.size;
      }

      // Slice to the exact amount requested
      allMessages = allMessages.slice(0, amount);

      // Delete in bulk (Discord allows up to 100 at a time, and bulkDelete is much faster)
      let deletedCount = 0;
      for (let i = 0; i < allMessages.length; i += 100) {
        const batch = allMessages.slice(i, i + 100);
        try {
          const deleted = await message.channel.bulkDelete(batch, true);
          deletedCount += deleted.size;
        } catch (err) {
          console.log(`[v0] Error bulk deleting batch:`, err.message);
        }
      }

      const confirmMessage = await message.reply({
        content: `<a:emoji_13:1508646379751342130> Purged ${deletedCount} messages!`,
      });

      // Delete the confirmation message after 3 seconds
      setTimeout(() => confirmMessage.delete().catch(() => null), 3000);

      console.log(`[v0] Purged ${deletedCount} messages in ${message.channel.name} by ${message.author.username}`);
    } catch (err) {
      console.error("[bot] purge error:", err.message);
      await message.reply({
        content: "<:emoji_11:1506864561435967509> Failed to purge messages.",
      });
    }
    return;
  }

  if (content !== `${PREFIX}hyperlink`) return;

  // Build the embed that prompts the user to submit a link
  const embed = new EmbedBuilder()
    .setDescription(
      "**─── <a:emoji_8:1506236357775720548> `ɪɴꜱᴀɴɪᴛʏ   | ʜʏᴘᴇʀʟɪɴᴋ` <a:emoji_8:1506236357775720548> ───\n\n" +
      "<a:emoji_13:1508646379751342130> ᴜꜱᴇ ᴛʜɪꜱ ᴛᴏᴏʟ ᴛᴏ ɢᴇɴᴇʀᴀᴛᴇ ʜʏᴘᴇʀʟɪɴᴋꜱ ᴛʜᴀᴛ ʙʏᴘᴀꜱꜱ ᴅɪꜱᴄᴏʀᴅ ᴡᴀʀɴɪɴɢꜱ\n\n" +
      "<:emoji_14:1508646444607864872> ʙᴇꜱᴛ ʜʏᴘᴇʀʟɪɴᴋ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**"
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
      content: `**ꜱᴇʀᴠᴇʀꜱ ᴛᴏ ʙ��ᴀᴍ — ${server.label}**\n\n${inviteLines}`,
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
      .setTitle("ꜱᴜʙᴍɪᴛ ʏᴏᴜʀ ʙᴇᴀᴍ ʟɪɴᴋ ᴛᴏ ʙʏᴘᴀꜱ�� ᴅɪꜱᴄᴏʀᴅ ꜰʟᴀɢ");

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

      // Submit URL to rbx-shortener.site API to create shortened link
      const shortenRes = await fetch(`https://www.rbx-shortener.site/api/create?url=${encodeURIComponent(rawUrl)}`);

      if (!shortenRes.ok) {
        console.log("[v0] Shorten request failed. Status:", shortenRes.status);
        await interaction.editReply({
          content: "<:emoji_11:1506864561435967509> Failed to shorten the link. Please try again.",
        });
        return;
      }

      const shortUrl = await shortenRes.text();
      console.log("[v0] Shortened URL:", shortUrl);

      // Validate the shortened URL
      if (!shortUrl || !shortUrl.includes("rbx-shortener.site")) {
        console.log("[v0] Invalid response from shorten API");
        await interaction.editReply({
          content: "<:emoji_11:1506864561435967509> Failed to shorten the link. Please try again.",
        });
        return;
      }

      // Parse the URL to extract path and query
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch (e) {
        await interaction.editReply({
          content: "<:emoji_11:1506864561435967509> Invalid URL. Please provide a valid URL starting with https:// or http://",
        });
        return;
      }

      const path = parsed.pathname || '/';
      const query = parsed.search ? parsed.search : '';
      const pathQ = (path + query).replace(/\/$/, '') || '/';
      
      // Format the label as https://www.roblox.com{path}{query} with __:__ instead of ://
      const labelUrl = `https://www.roblox.com${pathQ}`;
      const label = labelUrl.replace('://', '__:__');
      
      // Build markdown format exactly as specified: [label](shortUrl)
      const fmt = `[${label}](${shortUrl})`;

      // Build result embed
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
      
      console.log(`[v0] Generated hyperlink: ${fmt}`);
    } catch (err) {
      console.error("[bot] hyperlink error:", err.message);
      await interaction.editReply({
        content: "<:emoji_11:1506864561435967509> Something went wrong while hiding your link. Please try again.",
      });
    }
  }
});

// ── Graceful shutdown — ensures Railway kills the old instance cleanly ────────��──
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
