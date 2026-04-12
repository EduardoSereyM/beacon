/**
 * Create Poll Button Component
 * Deshabilitado para no-admins. Muestra modal "Próximamente"
 */

import React, { useState } from 'react';

interface CreatePollButtonProps {
  isAdmin: boolean;
  onCreateClick?: () => void;
}

const CreatePollButton: React.FC<CreatePollButtonProps> = ({ isAdmin, onCreateClick }) => {
  const [showModal, setShowModal] = useState(false);

  if (isAdmin) {
    return (
      <button
        onClick={onCreateClick}
        className="btn btn-primary"
        aria-label="Crear nueva encuesta"
      >
        ➕ Crear Encuesta
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="btn btn-outline"
        disabled
        aria-label="Crear encuesta - proximamente"
      >
        ➕ Crear Encuesta
      </button>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">📋 Próximamente</h3>
            <p className="py-4">
              Los usuarios podrán crear encuestas pronto. Actualmente, nuestro equipo genera encuestas verificadas
              basadas en los temas más relevantes para la ciudadanía.
            </p>
            <p className="text-sm text-gray-500">
              Puedes participar votando en las encuestas disponibles y compartiendo tus resultados.
            </p>
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => setShowModal(false)}
              >
                Entendido
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowModal(false)}>close</button>
          </form>
        </div>
      )}
    </>
  );
};

export default CreatePollButton;
