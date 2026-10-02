import { useEffect } from 'react';

const TALLY_EMBED_SCRIPT = 'https://tally.so/widgets/embed.js';

export default function StudentSurveyApp() {
  useEffect(() => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TALLY_EMBED_SCRIPT}"]`,
    );

    if (existingScript) {
      const tally = (window as Window & {
        Tally?: { loadEmbeds?: () => void };
      }).Tally;
      tally?.loadEmbeds?.();
      return;
    }

    const script = document.createElement('script');
    script.src = TALLY_EMBED_SCRIPT;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <iframe
      data-tally-src="https://tally.so/r/7R7A5L?formEventsForwarding=1"
      width="100%"
      height="100%"
      frameBorder="0"
      marginHeight={0}
      marginWidth={0}
      title="Student Attitudes Towards AI for University Research"
      style={{
        position: 'absolute',
        inset: 0,
        border: 0,
      }}
    />
  );
}
