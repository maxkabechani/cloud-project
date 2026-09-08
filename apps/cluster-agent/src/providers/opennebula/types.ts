export interface OpenNebulaClientOptions {
  endpoint: string;
  username: string;
  password: string;
}

export interface OpenNebulaUser {
  id: string;
  username: string;
  name: string;
}

export interface OpenNebulaVm {
  id: string;
  name: string;
  state: string;
}
