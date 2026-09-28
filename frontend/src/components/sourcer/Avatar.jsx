import React, { useState } from 'react';
import { cn } from '../ui/cn';

function initialsOf(name) {
  const words = String(name || '?').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

/* A person's photo where the source has one (GitHub does), their initials where
 * it doesn't or the image fails. Decorative: the name is always shown beside it. */
export default function Avatar({ person, size = 40, className }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (person?.avatar_url && !broken) {
    return (
      <img
        src={person.avatar_url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={box}
        className={cn('rounded-[8px] object-cover bg-surface-raised', className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      className={cn('grid place-items-center rounded-[8px] bg-surface-raised font-medium text-ink-muted', className)}
    >
      {initialsOf(person?.name)}
    </span>
  );
}
