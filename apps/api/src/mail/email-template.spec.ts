import { renderTransactionalEmail } from './email-template';

describe('renderTransactionalEmail', () => {
  it('renders a reusable premium HTML email and text fallback', () => {
    const email = renderTransactionalEmail({
      subject: 'Confirm your PgStudio email',
      preheader: 'Your code expires soon.',
      eyebrow: 'Email confirmation',
      title: 'Use this code to confirm your email',
      body: ['Enter the code below in PgStudio to continue.'],
      highlight: {
        label: 'One-time code',
        value: '123456',
        supportingText: 'Expires in 10 minutes.',
        monospace: true,
      },
      callout: {
        title: 'Security note',
        body: 'Never share this code.',
      },
    });

    expect(email.subject).toBe('Confirm your PgStudio email');
    expect(email.html).toContain('PgStudio');
    expect(email.html).toContain('Secure Mail');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('One-time code: 123456');
    expect(email.text).toContain('Never share this code.');
  });

  it('escapes dynamic content before inserting it into HTML', () => {
    const email = renderTransactionalEmail({
      subject: 'Subject <tag>',
      preheader: 'Preheader <script>',
      title: 'Hello <Admin>',
      body: ['Body & details'],
      highlight: { value: '<123456>' },
      action: { label: 'Open <PgStudio>', url: 'https://example.com?a=1&b=2' },
    });

    expect(email.html).toContain('Subject &lt;tag&gt;');
    expect(email.html).toContain('Preheader &lt;script&gt;');
    expect(email.html).toContain('Hello &lt;Admin&gt;');
    expect(email.html).toContain('Body &amp; details');
    expect(email.html).toContain('&lt;123456&gt;');
    expect(email.html).toContain('Open &lt;PgStudio&gt;');
    expect(email.html).toContain('https://example.com?a=1&amp;b=2');
  });
});
