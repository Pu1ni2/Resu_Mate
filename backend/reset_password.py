"""Reset a hiring manager's password directly in the local SQLite DB.

Usage:
    python reset_password.py <email> <new_password>

Example:
    python reset_password.py saipunithkolla@gmail.com mynewpass1234
"""
import sys
import sqlite3
from pathlib import Path

from app.services.auth import get_password_hash


def main():
    if len(sys.argv) != 3:
        print("Usage: python reset_password.py <email> <new_password>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    new_password = sys.argv[2]

    if len(new_password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    db_path = Path(__file__).parent / "resumate.db"
    if not db_path.exists():
        print(f"DB not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    cur.execute("SELECT id, name FROM hiring_managers WHERE email = ?", (email,))
    row = cur.fetchone()
    if not row:
        print(f"No account found for {email}.")
        cur.execute("SELECT email FROM hiring_managers ORDER BY id")
        existing = [r[0] for r in cur.fetchall()]
        if existing:
            print("Existing accounts:")
            for e in existing:
                print(f"  - {e}")
        sys.exit(1)

    new_hash = get_password_hash(new_password)
    cur.execute(
        "UPDATE hiring_managers SET password_hash = ? WHERE email = ?",
        (new_hash, email),
    )
    conn.commit()
    conn.close()

    print(f"Password reset for {email} (id={row[0]}, name={row[1]}).")
    print(f"You can now log in with the new password.")


if __name__ == "__main__":
    main()
