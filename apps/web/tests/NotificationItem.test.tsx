import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationRecord } from '@campusconnect/shared';
import { NotificationItem } from '@/components/student/NotificationItem';

const notification = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'ntf_1',
  type: 'SHORTLIST',
  title: 'You have been nominated',
  message: 'Northwind Systems has shortlisted you for Software Engineer.',
  companyName: 'Northwind Systems',
  roleTitle: 'Software Engineer',
  registrationUrl: 'https://northwind.example.com/apply',
  createdAt: '2026-02-01T09:00:00.000Z',
  readAt: null,
  roleId: 'rol_1',
  requestId: 'req_1',
  ...overrides,
});

describe('NotificationItem', () => {
  it('shows the company, role and message so a student knows what it is about', () => {
    render(<NotificationItem notification={notification()} />);

    expect(screen.getByText('You have been nominated')).toBeInTheDocument();

    // The metadata line joins company, role and timestamp with a separator.
    const meta = screen.getByText((_content, element) => element?.tagName === 'P' && (element.textContent ?? '').includes(' · '));
    expect(meta.textContent).toContain('Northwind Systems');
    expect(meta.textContent).toContain('Software Engineer');

    expect(screen.getByText(/has shortlisted you/)).toBeInTheDocument();
  });

  it('links to the employer registration page safely in a new tab', () => {
    render(<NotificationItem notification={notification()} />);

    const link = screen.getByRole('link', { name: /registration link/i });
    expect(link).toHaveAttribute('href', 'https://northwind.example.com/apply');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('marks an unread notification and lets the student mark it read', async () => {
    const onMarkRead = vi.fn();
    render(<NotificationItem notification={notification()} onMarkRead={onMarkRead} />);

    expect(screen.getByText('Unread')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /mark as read/i }));
    expect(onMarkRead).toHaveBeenCalledWith('ntf_1');
  });

  it('hides the mark-as-read control once the notification is read', () => {
    render(<NotificationItem notification={notification({ readAt: '2026-02-02T10:00:00.000Z' })} onMarkRead={vi.fn()} />);

    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as read/i })).not.toBeInTheDocument();
  });

  it('disables the action while the request is in flight', () => {
    render(<NotificationItem notification={notification()} onMarkRead={vi.fn()} busy />);

    expect(screen.getByRole('button', { name: /mark as read/i })).toBeDisabled();
  });
});
