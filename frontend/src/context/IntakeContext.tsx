import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface IntakeContextType {
  fileA: File | null;
  fileB: File | null;
  docAFile: string | null;
  docBFile: string | null;
  fileASize: number | null;
  fileBSize: number | null;
  matterId: string;
  matterTitle: string;
  contractValue: string;
  counterparty: string;
  jurisdiction: string;
  varianceSlider: number;
  selectedPreset: 'msa' | 'dpa' | 'ip' | 'custom';
  isUploaded: boolean;
  setFileA: (file: File | null) => void;
  setFileB: (file: File | null) => void;
  setDocAFile: (name: string | null) => void;
  setDocBFile: (name: string | null) => void;
  setMatterId: (id: string) => void;
  setMatterTitle: (title: string) => void;
  setContractValue: (val: string) => void;
  setCounterparty: (cp: string) => void;
  setJurisdiction: (j: string) => void;
  setVarianceSlider: (v: number) => void;
  setSelectedPreset: (preset: 'msa' | 'dpa' | 'ip' | 'custom') => void;
  setIsUploaded: (uploaded: boolean) => void;
  resetIntake: () => void;
}

const IntakeContext = createContext<IntakeContextType | undefined>(undefined);

export const IntakeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fileA, setFileAState] = useState<File | null>(null);
  const [fileB, setFileBState] = useState<File | null>(null);
  const [docAFile, setDocAFile] = useState<string | null>(null);
  const [docBFile, setDocBFile] = useState<string | null>(null);
  const [fileASize, setFileASize] = useState<number | null>(null);
  const [fileBSize, setFileBSize] = useState<number | null>(null);
  const [matterId, setMatterId] = useState<string>(
    () => `2025-INT-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [matterTitle, setMatterTitle] = useState('Enterprise Cloud & Licensing Agreement');
  const [contractValue, setContractValue] = useState('$4,200,000 ARR');
  const [counterparty, setCounterparty] = useState('Apex Dynamics Corp.');
  const [jurisdiction, setJurisdiction] = useState('Delaware Chancery Court');
  const [varianceSlider, setVarianceSlider] = useState(18.5);
  const [selectedPreset, setSelectedPreset] = useState<'msa' | 'dpa' | 'ip' | 'custom'>('msa');
  const [isUploaded, setIsUploaded] = useState(false);

  const setFileA = (file: File | null) => {
    setFileAState(file);
    if (file) {
      setDocAFile(file.name);
      setFileASize(file.size);
    } else {
      setDocAFile(null);
      setFileASize(null);
    }
  };

  const setFileB = (file: File | null) => {
    setFileBState(file);
    if (file) {
      setDocBFile(file.name);
      setFileBSize(file.size);
    } else {
      setDocBFile(null);
      setFileBSize(null);
    }
  };

  const resetIntake = () => {
    setFileAState(null);
    setFileBState(null);
    setDocAFile(null);
    setDocBFile(null);
    setFileASize(null);
    setFileBSize(null);
    setMatterId(`2025-INT-${Math.floor(1000 + Math.random() * 9000)}`);
    setMatterTitle('Enterprise Cloud & Licensing Agreement');
    setContractValue('$4,200,000 ARR');
    setCounterparty('Apex Dynamics Corp.');
    setJurisdiction('Delaware Chancery Court');
    setVarianceSlider(18.5);
    setSelectedPreset('msa');
    setIsUploaded(false);
  };

  return (
    <IntakeContext.Provider
      value={{
        fileA,
        fileB,
        docAFile,
        docBFile,
        fileASize,
        fileBSize,
        matterId,
        matterTitle,
        contractValue,
        counterparty,
        jurisdiction,
        varianceSlider,
        selectedPreset,
        isUploaded,
        setFileA,
        setFileB,
        setDocAFile,
        setDocBFile,
        setMatterId,
        setMatterTitle,
        setContractValue,
        setCounterparty,
        setJurisdiction,
        setVarianceSlider,
        setSelectedPreset,
        setIsUploaded,
        resetIntake,
      }}
    >
      {children}
    </IntakeContext.Provider>
  );
};

export const useIntake = (): IntakeContextType => {
  const context = useContext(IntakeContext);
  if (!context) {
    throw new Error('useIntake must be used within an IntakeProvider');
  }
  return context;
};
