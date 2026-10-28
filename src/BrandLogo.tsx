import './styles-brand.css';

/** Crop the supplied artwork in SVG coordinates to preserve its exact lettering. */
export function BrandLogo(){
  return <span className="jardin-logo-crop">
    <svg viewBox="30 11 160 26" width="160" height="26" role="img" aria-label="Jardin Fitness" xmlns="http://www.w3.org/2000/svg">
      <image href="/assets/brand/jardin-fitness-reference.png" width="254" height="49"/>
    </svg>
  </span>;
}
