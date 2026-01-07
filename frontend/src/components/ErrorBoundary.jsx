import React from "react";

/**
 * ErrorBoundary React:
 * - Empêche l'écran noir si un composant plante
 * - Affiche l'erreur et le stack (utile en dev)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI crashed:", error, info);
    this.setState({ info });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 20, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
        <h2>Erreur UI (l'application a évité un écran noir)</h2>
        <p style={{ color: "#b7c1d6" }}>
          Copie/colle ce message si tu veux que je corrige rapidement.
        </p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#ffaaaa" }}>
          {String(this.state.error)}
        </pre>
        {this.state.info?.componentStack && (
          <pre style={{ whiteSpace: "pre-wrap", color: "#c4cdde" }}>
            {this.state.info.componentStack}
          </pre>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ marginTop: 12 }}
        >
          Recharger
        </button>
      </div>
    );
  }
}


