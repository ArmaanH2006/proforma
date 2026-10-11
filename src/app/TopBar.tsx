import { useState } from 'react';
import { Button, Dialog, Menu } from '../components/Controls';
import { Icon } from '../components/Icon';
import { can, copyText, downloadText, EMBED } from '../lib/platform';
import {
  fileName,
  parseDeal,
  serializeDeal,
  shareHash,
  DealFormatError,
} from '../state/persistence';
import { blankDeal, SAMPLES } from '../state/samples';
import { useStore, type Theme } from '../state/store';

const THEME_NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<Theme, string> = {
  system: 'Theme: system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

export function TopBar() {
  const deal = useStore((s) => s.deal);
  const replaceDeal = useStore((s) => s.replaceDeal);
  const notify = useStore((s) => s.notify);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [dialog, setDialog] = useState<'import' | 'export' | null>(null);

  const exportDeal = async () => {
    const text = serializeDeal(deal);
    if (can.download) {
      downloadText(fileName(deal), text);
      notify(`Saved ${fileName(deal)}`);
    } else {
      setDialog('export');
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}${shareHash(deal)}`;
    const ok = await copyText(url);
    notify(
      ok
        ? 'Link copied. It contains the whole deal, so share it with care.'
        : 'Copy failed. Use Export instead.',
    );
  };

  return (
    <header className="topbar">
      <div className="wordmark">
        Proforma <small>Deal workbench</small>
      </div>
      <div className="topbar-deal">
        <strong>{deal.company.name || 'Untitled deal'}</strong>
        <span className="chip">{deal.company.stage}</span>
      </div>
      <div className="topbar-actions">
        <Menu
          label="Samples"
          items={[
            ...SAMPLES.map((s) => ({
              label: s.label,
              description: s.description,
              onSelect: () => replaceDeal(s.make(), `Loaded the ${s.label} sample`),
            })),
            'separator' as const,
            {
              label: 'Blank deal',
              description: 'Start from a single priced round',
              onSelect: () => replaceDeal(blankDeal(), 'Started a blank deal'),
            },
          ]}
        />
        <Button
          variant="ghost"
          icon="upload"
          title="Import a deal"
          onClick={() => setDialog('import')}
        >
          Import
        </Button>
        <Button variant="ghost" icon="download" title="Export this deal" onClick={exportDeal}>
          Export
        </Button>
        {can.shareLink && (
          <Button variant="ghost" icon="link" title="Copy a share link" onClick={share}>
            Share
          </Button>
        )}
        {!EMBED && (
          <Button
            variant="ghost"
            icon={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'}
            title={THEME_LABEL[theme]}
            onClick={() => setTheme(THEME_NEXT[theme])}
          />
        )}
      </div>
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && (
        <ExportDialog text={serializeDeal(deal)} onClose={() => setDialog(null)} />
      )}
    </header>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const replaceDeal = useStore((s) => s.replaceDeal);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = (json: string) => {
    try {
      const deal = parseDeal(json);
      replaceDeal(deal, `Imported ${deal.company.name}`);
      onClose();
    } catch (e) {
      setError(e instanceof DealFormatError ? e.message : 'That file could not be read.');
    }
  };

  return (
    <Dialog
      title="Import a deal"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => load(text)} disabled={!text.trim()}>
            Import
          </Button>
        </>
      }
    >
      <p className="subtle">
        Choose a .json file exported from Proforma, or paste its contents. This replaces the open
        deal.
      </p>
      <label className="btn" style={{ justifySelf: 'start' }}>
        <Icon name="file" />
        Choose file
        <input
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) load(await file.text());
          }}
        />
      </label>
      <textarea
        className="textarea mono"
        rows={8}
        placeholder='{"schema": 1, "company": { ... } }'
        value={text}
        aria-label="Deal JSON"
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && (
        <div className="callout error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
    </Dialog>
  );
}

function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const notify = useStore((s) => s.notify);
  return (
    <Dialog
      title="Export this deal"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon="copy"
            onClick={async () => {
              const ok = await copyText(text);
              notify(ok ? 'Deal JSON copied' : 'Copy failed. Select the text and copy it.');
            }}
          >
            Copy JSON
          </Button>
        </>
      }
    >
      <p className="subtle">
        Copy this JSON and save it as a .json file. Import it later to pick up where you left off.
      </p>
      <textarea
        className="textarea mono"
        rows={10}
        readOnly
        value={text}
        aria-label="Deal JSON"
        onFocus={(e) => e.currentTarget.select()}
      />
    </Dialog>
  );
}
