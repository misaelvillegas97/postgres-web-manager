import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div class="toast-container">
      @for (t of toast.toasts(); track t.id) {
        <button
          type="button"
          class="toast toast--{{ t.type }}"
          (click)="toast.dismiss(t.id)"
        >
          <span class="toast__icon">
            @switch (t.type) {
              @case ('success') {
                ✓
              }
              @case ('error') {
                ✕
              }
              @case ('warning') {
                ⚠
              }
              @default {
                ℹ
              }
            }
          </span>
          <span class="toast__msg">{{ t.message }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 9999;
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 8px;
        border: 0;
        padding: 9px 14px;
        border-radius: var(--radius);
        font-size: 12px;
        cursor: pointer;
        min-width: 240px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        animation: slide-in 0.2s ease;
        text-align: left;

        &--success {
          background: var(--bg-elevated);
          border: 1px solid var(--success);
          .toast__icon {
            color: var(--success);
          }
        }
        &--error {
          background: var(--bg-elevated);
          border: 1px solid var(--danger);
          .toast__icon {
            color: var(--danger);
          }
        }
        &--warning {
          background: var(--bg-elevated);
          border: 1px solid var(--warning);
          .toast__icon {
            color: var(--warning);
          }
        }
        &--info {
          background: var(--bg-elevated);
          border: 1px solid var(--info);
          .toast__icon {
            color: var(--info);
          }
        }
      }

      .toast__icon {
        font-weight: bold;
      }
      .toast__msg {
        color: var(--text-primary);
      }

      @keyframes slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class ToastContainerComponent {
  protected toast = inject(ToastService);
}
