import { setTimeout } from "timers/promises";

import { Rx } from "@spoot/rx";

export class RateLimiting {
  // the starting value will be replaced very quickly, but to avoid slowing down the first request we assume that all of our capacity is available
  private remainingRequests = new Rx.BehaviorSubject(10000);

  private decriment() {
    this.remainingRequests.next(this.remainingRequests.getValue() - 1);
  }

  async take() {
    for (
      let remaining = this.remainingRequests.getValue();
      true;
      remaining = this.remainingRequests.getValue()
    ) {
      if (remaining > 1000) {
        this.decriment();
        return;
      }

      if (remaining > 700) {
        console.log(
          "Running low on requests, slowing down to avoid hitting limit",
        );
        await setTimeout(1000);
        this.decriment();
        return;
      }

      if (remaining > 500) {
        console.log(
          "Running very low on requests, delaying request by 5 seconds to avoid hitting limit",
        );
        await setTimeout(5000);
        this.decriment();
        return;
      }

      if (remaining > 100) {
        console.log(
          "Running critically low on requests, delaying request by 1 minute to avoid hitting limit",
        );
        await setTimeout(60000);
        this.decriment();
        return;
      }

      console.log("Ran out of requests, waiting for more");
      await this.remainingRequests.pipe(Rx.filter((n) => n > 0)).toPromise();
    }
  }

  onResponse(respHeaders: Record<string, string>) {
    const remaining = respHeaders["x-ratelimit-remaining"];

    if (remaining) {
      const n = Number(remaining);
      if (!Number.isNaN(n)) {
        this.remainingRequests.next(n);
      }
    }
  }
}
