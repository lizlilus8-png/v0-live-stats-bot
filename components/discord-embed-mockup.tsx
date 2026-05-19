import React, { useState } from "react";

// ── Discord color palette ────────────────────────────────────────────────────────
const DC = {
  bg:      "#2b2d31",
  codeBg:  "#1e1f22",
  border:  "#5865f2",
  title:   "#ffffff",
  body:    "#dbdee1",
  muted:   "#80848e",
  label:   "#b5bac1",
  primary: "#5865f2",
};

const EXAMPLE_FMT      = "[https://www.roblox.com/users/387872695312/profile](https://linkurlshort.page.gd/index.php?r=3am4vBE)";
const GIF_URL          = "https://image2url.com/r2/default/gifs/1768488617981-bdc4c780-144f-4a40-8906-ddf01eadb705.gif";

// ── Parse Discord custom emoji syntax into <img> tags ───────────────────────────
// Handles: <a:name:id> (animated) and <:name:id> (static)
function parseEmoji(text: string): React.ReactNode[] {
  const parts = text.split(/(<a?:[^:>]+:\d+>)/g);
  return parts.map((part, i) => {
    const animated = part.match(/^<a:([^:>]+):(\d+)>$/);
    const staticE  = part.match(/^<:([^:>]+):(\d+)>$/);
    if (animated) {
      const [, name, id] = animated;
      return (
        <img
          key={i}
          src={`https://cdn.discordapp.com/emojis/${id}.gif`}
          alt={`:${name}:`}
          className="inline-block align-middle"
          style={{ width: 20, height: 20 }}
        />
      );
    }
    if (staticE) {
      const [, name, id] = staticE;
      return (
        <img
          key={i}
          src={`https://cdn.discordapp.com/emojis/${id}.webp`}
          alt={`:${name}:`}
          className="inline-block align-middle"
          style={{ width: 20, height: 20 }}
        />
      );
    }
    // Plain text — preserve newlines as <br>
    return part.split("\n").map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </React.Fragment>
    ));
  });
}

// ── Embed description lines ──────────────────────────────────────────────────────
const PROMPT_DESC =
  "**─── <:emoji_1:1500680900428435646> `ɪɴꜱᴀɴɪᴛʏ   | ʜʏᴘᴇʀʟɪɴᴋ` <:emoji_1:1500680900428435646> ───\n\n" +
  "<a:emoji_3:1500695831169204295> ʜɪᴅᴇꜱ ʏᴏᴜʀ ʟɪɴᴋ ᴛᴏ ᴍᴀᴋᴇ ɪᴛ ᴏʀɪɢɪɴᴀʟ\n\n" +
  "<:emoji_4:1501269124330950787> ʙᴇꜱᴛ ʜʏᴘᴇʀʟɪɴᴋ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**";

export default function DiscordEmbedMockup() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(EXAMPLE_FMT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-3 font-sans">

      {/* ── Prompt embed (shown on !hyperlink) — no left-border color ── */}
      <div
        className="rounded overflow-hidden max-w-md"
        style={{ backgroundColor: DC.bg, borderLeft: `4px solid ${DC.codeBg}` }}
      >
        <div className="p-3 pb-2">
          <p
            style={{ color: DC.body, fontWeight: 600 }}
            className="text-xs leading-relaxed"
          >
            {parseEmoji(PROMPT_DESC.replace(/\*\*/g, ""))}
          </p>
          <div className="mt-3 rounded overflow-hidden">
            <img
              src={GIF_URL}
              alt="Hyperlink banner"
              className="w-full object-cover rounded"
              style={{ maxHeight: 200 }}
            />
          </div>
        </div>
        <div className="px-3 pb-3 pt-1">
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded cursor-default select-none"
            style={{ backgroundColor: DC.primary, color: "#fff" }}
            tabIndex={-1}
            aria-disabled="true"
          >
            <img
              src="https://cdn.discordapp.com/emojis/1500695831169204295.gif"
              alt=":emoji_3:"
              style={{ width: 18, height: 18 }}
              className="inline-block align-middle"
            />
            <span>ʜʏᴘᴇʀʟɪɴᴋ</span>
          </button>
        </div>
      </div>

      {/* ── Result embed (shown after modal submit) — no border color ── */}
      <div
        className="rounded overflow-hidden max-w-md"
        style={{ backgroundColor: DC.bg, borderLeft: `4px solid ${DC.codeBg}` }}
      >
        <div className="p-3 space-y-2">
          {/* Title */}
          <p className="text-sm font-bold" style={{ color: DC.title }}>
            ʟɪɴᴋ ʜɪᴅᴇ ᴄᴏᴘʏ ᴀɴᴅ ꜱʜᴀʀᴇ
          </p>

          {/* Formatted output — single backtick inline code style + copy button */}
          <div className="flex items-start gap-2">
            <code
              className="flex-1 text-xs font-mono px-2 py-1.5 rounded break-all"
              style={{ backgroundColor: DC.codeBg, color: DC.body }}
            >
              {EXAMPLE_FMT}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
              style={{
                backgroundColor: copied ? "#57f287" : DC.primary,
                color: "#fff",
              }}
            >
              {copied ? "Copied!" : "COPY"}
            </button>
          </div>

          {/* Instruction text */}
          <p className="text-xs italic" style={{ color: DC.muted }}>
            ᴄᴏᴘʏ ᴛʜᴇ ᴛᴇxᴛ ᴀʙᴏᴠᴇ ᴛᴏ ɢᴇᴛ ʏᴏᴜʀ ʜʏᴘᴇʀʟɪɴᴋ
          </p>

          {/* Footer */}
          <p className="text-[11px] pt-1 border-t" style={{ color: DC.muted, borderColor: DC.codeBg }}>
            Requested by exampleuser
          </p>
        </div>
      </div>

      {/* ── Follow-up plain message — only the fmt text, fully selectable/copyable ── */}
      <div className="max-w-md">
        <p
          className="text-xs font-mono px-2 py-1.5 rounded break-all select-all cursor-text"
          style={{ backgroundColor: DC.codeBg, color: DC.body }}
        >
          {EXAMPLE_FMT}
        </p>
      </div>

    </div>
  );
}
