import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { TerraformOutput } from "cdktf";
import { DataAwsRoute53Zone } from "@cdktf/provider-aws/lib/data-aws-route53-zone";
import { Route53Zone } from "@cdktf/provider-aws/lib/route53-zone";
import { Route53Record } from "@cdktf/provider-aws/lib/route53-record";

export interface Route53RecordConfig {
  readonly domainName: string;
  readonly distributionDomainName: string;
  readonly distributionHostedZoneId: string;
  readonly createHostedZone?: boolean;
  readonly godaddyConfig?: {
    apiKey: string;
    apiSecret: string;
  };
  readonly tags?: Record<string, string>;

}


export class CustomRoute53Record extends Construct {
  public readonly hostedZoneId: string;
  public readonly nameServers: string[];
  public cloudfrontRecord: Route53Record;
  private zone?: Route53Zone;

  constructor(scope: Construct, id: string, config: Route53RecordConfig) {
    super(scope, id);

    const shouldCreateZone = config.createHostedZone !== false;

    if (shouldCreateZone) {
      const zone = new Route53Zone(this, "zone", {
        name: config.domainName,
        tags: config.tags
      });
      this.hostedZoneId = zone.zoneId;
      this.nameServers = zone.nameServers;
      // Output nameservers for reference
      new TerraformOutput(this, "nameservers", {
        value: this.nameServers,
        description: "Name servers for the hosted zone",
      });

      // Optionally update GoDaddy if config provided
      if (config.godaddyConfig) {
        this.updateGoDaddyNameservers(config.domainName, config.godaddyConfig);
      }
    } else {
      const existingZone = new DataAwsRoute53Zone(this, "existing_zone", {
        name: `${config.domainName}.`,
      });
      this.hostedZoneId = existingZone.zoneId;
      this.nameServers = existingZone.nameServers;
    }

    // Create empty record that will be updated later
    this.cloudfrontRecord = new Route53Record(this, "cloudfront_record", {
      zoneId: this.hostedZoneId,
      name: config.domainName,
      type: "A",
      alias: {
        name: "", // Will be updated
        zoneId: "", // Will be updated
        evaluateTargetHealth: false,
      },
    });
  }

  public updateCloudFrontAlias(
    distributionDomainName: string,
    distributionHostedZoneId: string
  ) {
    // Terraform CDK doesn't directly support updates, so we need to modify the underlying config
    const record = this.cloudfrontRecord as any;
    record.alias.internalValue = {
      name: distributionDomainName,
      zoneId: distributionHostedZoneId,
      evaluateTargetHealth: false,
    };
  }
  private logToFile(message: string) {
    const logDir = path.join(process.cwd(), "logs");
    const logFile = path.join(logDir, "godaddy-api.log");

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    fs.appendFileSync(logFile, logMessage, { encoding: "utf-8" });
  }
  private updateGoDaddyNameservers(
    domain: string,
    config: { apiKey: string; apiSecret: string }
  ) {
    if (!config.apiKey || !config.apiSecret) {
      const errorMessage = "API key or secret is missing!";
      console.error(errorMessage);
      this.logToFile(`ERROR: ${errorMessage}`);
      return;
    }
  
    const updateNs = (nameservers: string[]) => {
      if (!nameservers || nameservers.length === 0) {
        const errorMessage = "No nameservers provided for update!";
        console.error(errorMessage);
        this.logToFile(`ERROR: ${errorMessage}`);
        return;
      }
  
      const requestData = JSON.stringify(
        nameservers.map((server: string) => ({
          name: "@",
          type: "NS",
          data: server,
          ttl: 3600,
        }))
      );
  
      this.logToFile(`Sending request to GoDaddy API:\n${requestData}`);
  
      const options = {
        hostname: "api.godaddy.com",
        path: `/v1/domains/${domain}/records`,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": requestData.length,
          Authorization: `sso-key ${config.apiKey}:${config.apiSecret}`,
        },
      };
  
      const req = https.request(options, (res) => {
        let responseData = "";
        res.on("data", (chunk) => (responseData += chunk));
        res.on("end", () => {
          const logMessage = `Received response from GoDaddy API:
  Status Code: ${res.statusCode}
  Headers: ${JSON.stringify(res.headers, null, 2)}
  Body: ${responseData}`;
  
          this.logToFile(logMessage);
  
          if (res.statusCode === 200) {
            const successMessage = `Successfully updated GoDaddy nameservers to: ${nameservers.join(
              ", "
            )}`;
            console.log(successMessage);
            this.logToFile(successMessage);
          } else {
            const errorMessage = `Failed to update GoDaddy nameservers: ${responseData}`;
            console.error(errorMessage);
            this.logToFile(`ERROR: ${errorMessage}`);
          }
        });
      });
  
      req.on("error", (error) => {
        const errorMessage = `Error updating GoDaddy nameservers: ${error.message}`;
        console.error(errorMessage);
        this.logToFile(`ERROR: ${errorMessage}`);
      });
  
      req.write(requestData);
      req.end();
    };
  
    // Check if nameServers is already resolved
    if (this.nameServers && this.nameServers.length > 0) {
      updateNs(this.nameServers);
    } else if (this.zone) {
      const ns = this.zone.nameServers as unknown as { value: string[] };
      if (ns.value) {
        updateNs(ns.value);
      }
    }
  }
  
}
