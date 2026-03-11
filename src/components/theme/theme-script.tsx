export function ThemeScript() {
  const code = `(() => {
    try {
      const stored = localStorage.getItem('dividend-theme') || 'system';
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = stored === 'dark' || (stored === 'system' && systemDark);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.dataset.theme = stored;
    } catch (e) {}
  })();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
