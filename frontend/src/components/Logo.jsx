const T_SHAPE = [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];

export default function Logo({ size = 22, dot = 6 }) {
  return (
    <span className="logo" aria-label="Tokenin">
      <span className="logo-dots" style={{ '--d': `${dot}px` }} aria-hidden="true">
        {T_SHAPE.map((on, i) => (
          <span key={i} className={on ? 'on' : ''} />
        ))}
      </span>
      <span className="logo-word" style={{ fontSize: size }} aria-hidden="true">
        TOKEN<em>IN</em>
      </span>
    </span>
  );
}
