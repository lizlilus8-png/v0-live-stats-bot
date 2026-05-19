// Real Discord colors — no oklch
const DC = {
  bg:       "#2b2d31",
  embedBg:  "#2b2d31",
  codeBg:   "#1e1f22",
  border:   "#5865f2",
  title:    "#ffffff",
  body:     "#dbdee1",
  muted:    "#80848e",
  label:    "#b5bac1",
  primary:  "#5865f2",
};

const EXAMPLE_FMT      = "[https//www.roblox.com/users/387872695312/profile](https://linkurlshort.page.gd/index.php?r=3am4vBE)";
const EXAMPLE_SHORT    = "https://linkurlshort.page.gd/index.php?r=3am4vBE";
const EXAMPLE_ORIGINAL = "https://www.roblox.com/users/387872695312/profile";

export default function DiscordEmbedMockup() {
  return (
    <div className="space-y-3 font-sans">

      {/* ── Prompt embed (shown on !hyperlink) ── */}
      <div
        className="rounded overflow-hidden max-w-md"
        style={{ backgroundColor: DC.embedBg, borderLeft: `4px solid ${DC.border}` }}
      >
        <div className="p-3 space-y-2">
          <p style={{ color: DC.title }} className="text-sm font-semibold leading-snug">
            Hide a Link with Hyperlink
          </p>
          <p style={{ color: DC.body }} className="text-xs leading-relaxed">
            Want to disguise a long URL as a clean hyperlink?{" "}
            Click <strong>Submit Link</strong> below, paste your URL, and the bot will return a
            formatted hyperlink you can share anywhere.
          </p>
          <p style={{ color: DC.muted }} className="text-[11px]">
            Powered by linkurlshort.page.gd
          </p>
        </div>
        <div className="px-3 pb-3">
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded cursor-default"
            style={{ backgroundColor: DC.primary, color: "#fff" }}
            tabIndex={-1}
            aria-disabled="true"
          >
            Submit Link
          </button>
        </div>
      </div>

      {/* ── Result embed (shown after modal submit) ── */}
      <div
        className="rounded overflow-hidden max-w-md"
        style={{ backgroundColor: DC.embedBg, borderLeft: `4px solid ${DC.border}` }}
      >
        <div className="p-3 space-y-3">
          {/* Description block — matches the bot's setDescription layout */}
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

          {/* Footer */}
          <p style={{ color: DC.muted }} className="text-[11px] border-t pt-2" >
            linkurlshort.page.gd
          </p>
        </div>
      </div>

    </div>
  );
}
