import React from 'react';
import { Copy } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { toast } from '../../services/notify';

/* Where invited candidates sign in, for the manager to send on when the
 * invitation wasn't emailed. */
export default function PortalLink({ link }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied', 'success');
    } catch {
      toast('Could not copy. Select the link and copy it.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Input readOnly value={link} aria-label="Candidate sign-in link" onFocus={e => e.target.select()} />
      <Button onClick={copy}><Copy size={14} /> Copy link</Button>
    </div>
  );
}
