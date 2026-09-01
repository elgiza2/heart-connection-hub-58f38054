import React from "react";

interface ChatHiddenFileInputsProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  imageInputRef: React.RefObject<HTMLInputElement>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCameraCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ChatHiddenFileInputs = ({
  fileInputRef,
  cameraInputRef,
  imageInputRef,
  handleFileUpload,
  handleCameraCapture,
  handleImageUpload,
}: ChatHiddenFileInputsProps) => {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept=".pdf,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.doc,.docx"
        multiple
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        onChange={handleCameraCapture}
        accept="image/*"
        capture="environment"
      />
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        onChange={handleImageUpload}
        accept="image/*,video/*"
        multiple
      />
    </>
  );
};

export default ChatHiddenFileInputs;
