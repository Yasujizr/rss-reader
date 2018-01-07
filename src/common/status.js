

// TODO: should I throw type errors as indicative of unexpected input, or should i return
// an error code like EINVAL?

export const OK = 0;
export const EFETCH = 1;
export const ENET = 2;
export const ENOACCEPT = 3;
export const EOFFLINE = 4;
export const EPARSEXML = 5;
export const EPARSEFEED = 6;
export const EPARSEHTML = 7;
export const EPARSEOPML = 8;
export const EPOLICY = 9;
export const ETIMEOUT = 10;
export const EDBCONSTRAINT = 11;