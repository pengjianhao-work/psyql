import { supportHotlines } from '../student/supportResources';

export function SupportHotlineList() {
  return (
    <ul aria-label="心理援助热线">
      {supportHotlines.map(({ label, numbers }) => (
        <li key={label}>
          {label}
          <ul>
            {numbers.map((contact) => (
              <li key={contact.number}>
                {contact.label} <a href={`tel:${contact.number.replace(/-/g, '')}`}>{contact.number}</a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
