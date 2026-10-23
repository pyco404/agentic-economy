import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { officialToken } from '../content/project';
import './official-token-address.css';

/** Public identity only. This does not select a mint for the launch form. */
export function OfficialTokenAddress({ prominent = false }: { prominent?: boolean }) {
  const [feedback, setFeedback] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(officialToken.mint);
      setFeedback('Contract address copied.');
    } catch {
      setFeedback('Could not copy. Select the full address to copy it.');
    }
  };
  return <section className={`official-token-address${prominent ? ' is-prominent' : ''}`} aria-label="Official $AECO contract address">
    {prominent ? <h2>Official $AECO Contract Address</h2> : <span className="official-token-label">Official $AECO CA</span>}
    <code className="official-token-mint ui-select-text" title={officialToken.mint}>{officialToken.mint}</code>
    <div className="official-token-actions">
      <button type="button" className="secondary" onClick={() => void copy()} aria-label="Copy official $AECO contract address">
        {feedback === 'Contract address copied.' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span>{feedback === 'Contract address copied.' ? 'Copied' : 'Copy'}</span>
      </button>
      <a href={officialToken.solscanUrl} target="_blank" rel="noopener noreferrer">View on Solscan <ExternalLink size={13} aria-hidden="true" /></a>
    </div>
    <span className="official-token-feedback" role="status" aria-live="polite">{feedback}</span>
  </section>;
}
