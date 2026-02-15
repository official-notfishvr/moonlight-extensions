import spacepack from "@moonlight-mod/wp/spacepack_spacepack";

function init() {
  setInterval(() => {
    const players = document.querySelectorAll('[class*="voiceAudio_"]');
    for (const player of players) {
      if (player.querySelector(".vc-voice-download")) continue;

      const fiberKey = Object.keys(player).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
      );
      let fiber = fiberKey ? (player as any)[fiberKey] : null;
      let src = null;
      let depth = 0;
      while (fiber && !src && depth < 50) {
        src = fiber.memoizedProps?.src || fiber.pendingProps?.src;
        fiber = fiber.return;
        depth++;
      }

      if (!src) continue;

      const container = player.querySelector('[class*="audioControls_"]');
      if (!container) continue;

      const downloadBtn = document.createElement("a");
      downloadBtn.className = "vc-voice-download";
      downloadBtn.href = src;
      downloadBtn.onclick = (e) => e.stopPropagation();
      downloadBtn.setAttribute("aria-label", "Download voice message");
      downloadBtn.setAttribute("target", "_blank");
      downloadBtn.style.display = "flex";
      downloadBtn.style.alignItems = "center";
      downloadBtn.style.justifyContent = "center";
      downloadBtn.style.width = "24px";
      downloadBtn.style.height = "24px";
      downloadBtn.style.marginLeft = "8px";
      downloadBtn.style.color = "var(--interactive-normal)";

      downloadBtn.innerHTML = `<svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z"/></svg>`;

      container.appendChild(downloadBtn);
    }
  }, 1000);
}

init();
