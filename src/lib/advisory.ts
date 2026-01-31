import { EventEmitter } from "events";
import { AdvisoryResource } from "@app/resources/advisory";

export interface AdvisoryMessage {
  id: number;
  runId: number;
  agentIndex: number | null;
  content: string;
  timestamp: Date;
  delivered: boolean;
}

export interface AdvisoryEvents {
  message: (message: AdvisoryMessage) => void;
}

export class TypedEventEmitter extends EventEmitter {
  on<K extends keyof AdvisoryEvents>(
    event: K,
    listener: AdvisoryEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof AdvisoryEvents>(
    event: K,
    ...args: Parameters<AdvisoryEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  off<K extends keyof AdvisoryEvents>(
    event: K,
    listener: AdvisoryEvents[K]
  ): this {
    return super.off(event, listener);
  }
}

export const advisoryEmitter = new TypedEventEmitter();

export async function sendAdvisory(
  runId: number,
  content: string,
  agentIndex?: number
): Promise<AdvisoryMessage> {
  const resource = await AdvisoryResource.create({
    run_id: runId,
    content,
    agent_index: agentIndex ?? null,
  });

  const data = resource.toJSON();
  const message: AdvisoryMessage = {
    id: data.id,
    runId: data.run_id,
    agentIndex: data.agent_index,
    content: data.content,
    timestamp: data.created,
    delivered: data.delivered,
  };

  advisoryEmitter.emit("message", message);

  return message;
}

export async function getPendingAdvisories(
  runId: number,
  agentIndex: number
): Promise<AdvisoryMessage[]> {
  const resources = await AdvisoryResource.listPending(runId, agentIndex);

  return resources.map((resource) => {
    const data = resource.toJSON();
    return {
      id: data.id,
      runId: data.run_id,
      agentIndex: data.agent_index,
      content: data.content,
      timestamp: data.created,
      delivered: data.delivered,
    };
  });
}
