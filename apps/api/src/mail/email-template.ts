export interface TransactionalEmailAction {
  label: string;
  url: string;
}

export interface TransactionalEmailHighlight {
  label?: string;
  value: string;
  supportingText?: string;
  monospace?: boolean;
}

export interface TransactionalEmailCallout {
  title?: string;
  body: string;
}

export interface TransactionalEmailTemplateInput {
  subject: string;
  preheader: string;
  eyebrow?: string;
  title: string;
  body: string[];
  highlight?: TransactionalEmailHighlight;
  action?: TransactionalEmailAction;
  callout?: TransactionalEmailCallout;
  footer?: string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderTransactionalEmail(
  input: TransactionalEmailTemplateInput,
): RenderedEmail {
  const subject = input.subject.trim();
  const footer = input.footer?.length
    ? input.footer
    : [
        'PgStudio sends security emails for account access, database workspace activity, and authentication events.',
        'If you were not expecting this email, you can safely ignore it.',
      ];

  return {
    subject,
    html: renderHtml({ ...input, subject, footer }),
    text: renderText({ ...input, subject, footer }),
  };
}

function renderHtml(
  input: TransactionalEmailTemplateInput & { footer: string[] },
): string {
  const escapedPreheader = escapeHtml(input.preheader);
  const eyebrow = input.eyebrow
    ? `<div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; line-height: 18px; margin: 0 0 12px; text-transform: uppercase; color: #31776b;">${escapeHtml(input.eyebrow)}</div>`
    : '';
  const body = input.body
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 18px; font-size: 16px; line-height: 26px; color: #304056;">${escapeHtml(paragraph)}</p>`,
    )
    .join('');
  const highlight = input.highlight ? renderHighlight(input.highlight) : '';
  const action = input.action ? renderAction(input.action) : '';
  const callout = input.callout ? renderCallout(input.callout) : '';
  const footer = input.footer
    .map(
      (line) =>
        `<p style="margin: 0 0 8px; font-size: 12px; line-height: 18px; color: #718096;">${escapeHtml(line)}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.subject)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { padding: 24px 12px !important; }
        .email-card { border-radius: 18px !important; }
        .email-card-inner { padding: 30px 22px !important; }
        .email-title { font-size: 28px !important; line-height: 34px !important; }
        .email-code { font-size: 32px !important; letter-spacing: 6px !important; }
        .email-brand-copy { display: block !important; margin-top: 12px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #f4f7fb; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; line-height: 1px; mso-hide: all;">${escapedPreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; background: #f4f7fb;">
      <tr>
        <td align="center" class="email-shell" style="padding: 44px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 640px;">
            <tr>
              <td style="padding: 0 8px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" style="vertical-align: middle;">
                      <span style="display: inline-block; width: 42px; height: 42px; border-radius: 12px; background: #0d4f45; color: #ffffff; font-family: Inter, Arial, sans-serif; font-size: 15px; font-weight: 800; line-height: 42px; text-align: center; vertical-align: middle;">PG</span>
                      <span class="email-brand-copy" style="display: inline-block; margin-left: 12px; vertical-align: middle; font-family: Inter, Arial, sans-serif;">
                        <span style="display: block; font-size: 18px; font-weight: 800; line-height: 22px; color: #132433;">PgStudio</span>
                        <span style="display: block; font-size: 12px; line-height: 16px; color: #718096;">by Devly</span>
                      </span>
                    </td>
                    <td align="right" style="vertical-align: middle; font-family: Inter, Arial, sans-serif; font-size: 12px; font-weight: 700; line-height: 18px; color: #31776b;">Secure Mail</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-card" style="border-radius: 24px; background: #ffffff; box-shadow: 0 22px 54px rgba(20, 45, 70, 0.12); overflow: hidden;">
                <div style="height: 6px; background: #0d4f45;"></div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td class="email-card-inner" style="padding: 42px 46px 36px; font-family: Inter, Arial, sans-serif;">
                      ${eyebrow}
                      <h1 class="email-title" style="margin: 0 0 18px; font-size: 34px; line-height: 40px; font-weight: 800; color: #132433; letter-spacing: 0;">${escapeHtml(input.title)}</h1>
                      ${body}
                      ${highlight}
                      ${action}
                      ${callout}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 8px 0; font-family: Inter, Arial, sans-serif; text-align: center;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderHighlight(highlight: TransactionalEmailHighlight): string {
  const label = highlight.label
    ? `<div style="margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; line-height: 18px; text-transform: uppercase; color: #5f6f81;">${escapeHtml(highlight.label)}</div>`
    : '';
  const valueStyle = highlight.monospace
    ? 'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 38px; line-height: 46px; letter-spacing: 8px;'
    : 'font-family: Inter, Arial, sans-serif; font-size: 24px; line-height: 32px; letter-spacing: 0;';
  const supportingText = highlight.supportingText
    ? `<div style="margin: 14px 0 0; font-size: 14px; line-height: 22px; color: #5f6f81;">${escapeHtml(highlight.supportingText)}</div>`
    : '';

  return `<div style="margin: 26px 0 28px; padding: 24px; border: 1px solid #d7e4ef; border-radius: 18px; background: #f7fbfd; text-align: center;">
    ${label}
    <div class="email-code" style="${valueStyle} font-weight: 800; color: #102f2b;">${escapeHtml(highlight.value)}</div>
    ${supportingText}
  </div>`;
}

function renderAction(action: TransactionalEmailAction): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
    <tr>
      <td style="border-radius: 12px; background: #0d4f45;">
        <a href="${escapeHtml(action.url)}" style="display: inline-block; padding: 14px 20px; font-family: Inter, Arial, sans-serif; font-size: 15px; font-weight: 800; line-height: 20px; color: #ffffff; text-decoration: none;">${escapeHtml(action.label)}</a>
      </td>
    </tr>
  </table>`;
}

function renderCallout(callout: TransactionalEmailCallout): string {
  const title = callout.title
    ? `<div style="margin: 0 0 6px; font-size: 14px; font-weight: 800; line-height: 20px; color: #132433;">${escapeHtml(callout.title)}</div>`
    : '';

  return `<div style="margin: 28px 0 0; padding: 18px 20px; border-left: 4px solid #0d4f45; border-radius: 14px; background: #eef7f3;">
    ${title}
    <div style="font-size: 14px; line-height: 22px; color: #405268;">${escapeHtml(callout.body)}</div>
  </div>`;
}

function renderText(
  input: TransactionalEmailTemplateInput & { footer: string[] },
): string {
  const lines = [
    input.subject,
    input.eyebrow,
    input.title,
    ...input.body,
    input.highlight
      ? `${input.highlight.label ? `${input.highlight.label}: ` : ''}${input.highlight.value}`
      : undefined,
    input.highlight?.supportingText,
    input.action ? `${input.action.label}: ${input.action.url}` : undefined,
    input.callout
      ? `${input.callout.title ? `${input.callout.title}: ` : ''}${input.callout.body}`
      : undefined,
    ...input.footer,
  ];

  return lines
    .filter((line): line is string => Boolean(line))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
