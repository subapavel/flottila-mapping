import { LayerGroupIcon } from '@patternfly/react-icons';
import './shell.css';

/** The studio's masthead, "Flottila | Mapping studio" (ADR-0028); the brand links to the start page at `homeHref`. */
export function Masthead({ homeHref }: { homeHref: string }) {
  return (
    <header className="masthead">
      <a className="brand" href={homeHref}>
        <span className="brand-icon">
          <LayerGroupIcon />
        </span>
        Flottila
      </a>
      <span className="mast-divider" />
      <span className="mast-product">Mapping studio</span>
    </header>
  );
}
