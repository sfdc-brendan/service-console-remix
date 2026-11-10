import { useEffect } from 'react';

const OFFSET_PROPERTIES = ['margin-top', 'padding-top'] as const;

/**
 * The Salesforce host injects <sf-session-banner> after boot and reserves space for it on <body>,
 * sometimes via inline styles. Inline !important is the only thing that outranks that reservation.
 */
export function useHostChrome() {
  useEffect(() => {
    const { body } = document;
    const pin = () => {
      for (const property of OFFSET_PROPERTIES) {
        if (
          body.style.getPropertyValue(property) !== '0px' ||
          body.style.getPropertyPriority(property) !== 'important'
        ) {
          body.style.setProperty(property, '0px', 'important');
        }
      }
    };
    pin();
    const observer = new MutationObserver(pin);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
    });
    return () => observer.disconnect();
  }, []);
}
