import React from "react";

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
const EXAMPLE_SHORT    = "https://linkurlshort.page.gd/index.php?r=3am4vBE";
const EXAMPLE_ORIGINAL = "https://www.roblox.com/users/387872695312/profile";
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
  "**─── <a:glowingcross:1462280458413801626> `ɪɴꜱᴀɴɪᴛʏ   | ʜʏᴘᴇʀʟɪɴᴋ` <a:glowingcross:1462280458413801626> ───\n\n" +
  "<a:emoji_3:1500695831169204295> ʜɪᴅᴇꜱ ʏᴏᴜʀ ʟɪɴᴋ ᴛᴏ ᴍᴀᴋᴇ ɪᴛ ᴏʀɪɢɪɴᴀʟ\n\n" +
  "<:emoji_4:1501269124330950787> ʙᴇꜱᴛ ʜʏᴘᴇʀʟɪɴᴋ ᴏꜰ ᴀʟʟ ᴛɪᴍᴇ**";

export default function DiscordEmbedMockup() {
  return (
    <div className="space-y-3 font-sans">

      {/* ── Prompt embed (shown on !hyperlink) ── */}
      <div
        className="rounded overflow-hidden max-w-md"
        style={{ backgroundColor: DC.bg, borderLeft: `4px solid ${DC.border}` }}
      >
        <div className="p-3 pb-2">
          {/* Description — bold wrapper + emoji rendering */}
          <p
            style={{ color: DC.body, fontWeight: 600 }}
            className="text-xs leading-relaxed"
          >
            {parseEmoji(PROMPT_DESC.replace(/\*\*/g, ""))}
          </p>

          {/* Large GIF image */}
          <div className="mt-3 rounded overflow-hidden">
            <img
              src={GIF_URL}
              alt="Hyperlink banner"
              className="w-full object-cover rounded"
              style={{ maxHeight: 200 }}
            />
          </div>
        </div>

        {/* Button with animated emoji */}
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

      {/* ── Result embed (shown after modal submit) ── */}
      <div
        className="rounded overflow-hidden max-w-md"
        style={{ backgroundColor: DC.bg, borderLeft: `4px solid ${DC.border}` }}
      >
        <div className="p-3 space-y-3">
          <div style={{ color: DC.body }} className="text-xs leading-relaxed space-y-2">
            <p>
              <strong style={{ color: DC.title }}>Link Shortened</strong>
              {" — ready to copy and share"}
            </p>

            <div>
              <p style={{ color: DC.label }} className="font-semibold mb-1">Formatted Output</p>
              <pre
                className="text-xs font-mono p-2 rounded break-all whitespace-pre-wrap"
                style={{ backgroundColor: DC.codeBg, color: DC.body }}
              >
                {EXAMPLE_FMT}
              </pre>
            </div>

            <div>
              <p style={{ color: DC.label }} className="font-semibold mb-0.5">Short URL</p>
              <p style={{ color: DC.primary }} className="font-mono text-xs break-all">
                {EXAMPLE_SHORT}
              </p>
            </div>

            <div>
              <p style={{ color: DC.label }} className="font-semibold mb-0.5">Original URL</p>
              <p style={{ color: DC.muted }} className="font-mono text-xs break-all">
                {EXAMPLE_ORIGINAL}
              </p>
            </div>
          </div>

          <p style={{ color: DC.muted }} className="text-[11px] border-t pt-2">
            linkurlshort.page.gd
          </p>
        </div>
      </div>

    </div>
  );
}
