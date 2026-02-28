import { PropertiesApi } from "./PropertiesApi";
import { FeesApi } from "./FeesApi";
import { PricingApi } from "./PricingApi";
import { LeadsApi } from "./LeadsApi";
import { MessagesApi } from "./MessagesApi";
import { AgenciesApi } from "./AgenciesApi";
import { Transport } from "./Transport";
import { OrderApi } from "./OrderApi";
import { AmenitiesApi } from "./AmenitiesApi";

export class HostfullyApi {
  constructor(
    public readonly agencyUid: string,
    public readonly transport: Transport,
  ) {}

  get agencies() {
    return new AgenciesApi(this);
  }

  get properties() {
    return new PropertiesApi(this);
  }

  get fees() {
    return new FeesApi(this);
  }

  get pricing() {
    return new PricingApi(this);
  }

  get leads() {
    return new LeadsApi(this);
  }

  get messages() {
    return new MessagesApi(this);
  }

  get orders() {
    return new OrderApi(this);
  }

  get amenities() {
    return new AmenitiesApi(this);
  }
}
