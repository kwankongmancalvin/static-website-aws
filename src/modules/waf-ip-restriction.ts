import { Construct } from 'constructs';
import { TerraformStack } from "cdktf";
import { 
  wafv2WebAcl,
  wafv2IpSet,
  dataAwsCallerIdentity
} from "@cdktf/provider-aws";

export interface WafIpRestrictionConfig {
  readonly ipAddress: string;
  readonly webAclName?: string;
  readonly ipSetName?: string;
  readonly tags?: Record<string, string>;
}

export class WafIpRestriction extends Construct {
  public readonly webAclArn: string;
  public readonly ipSet: wafv2IpSet.Wafv2IpSet;
  public readonly webAcl: wafv2WebAcl.Wafv2WebAcl;

  constructor(scope: Construct, id: string, config: WafIpRestrictionConfig) {
    super(scope, id);

    // Get current account ID
    const currentAccount = new dataAwsCallerIdentity.DataAwsCallerIdentity(this, 'current');

    // Create IP Set (must be in us-east-1 for CloudFront)
    this.ipSet = new wafv2IpSet.Wafv2IpSet(this, 'allowed_ips', {
      name: config.ipSetName || `${currentAccount.accountId}-allowed-ips`,
      description: 'IP addresses allowed to access the application',
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4',
      addresses: [this.formatIpAddress(config.ipAddress)],
      tags: {
        ManagedBy: 'cdktf',
        ...config.tags
      },
      provider: this.getUsEast1Provider(scope)
    });

    // Create Web ACL with correct statement structure
    this.webAcl = new wafv2WebAcl.Wafv2WebAcl(this, 'web_acl', {
      name: config.webAclName || `${currentAccount.accountId}-ip-restriction`,
      description: 'Restricts access to specific IP addresses',
      scope: 'CLOUDFRONT',
      defaultAction: {
        block: {} // Default action is to block all requests
      },
      visibilityConfig: {
        cloudwatchMetricsEnabled: true,
        metricName: 'web-acl-metrics',
        sampledRequestsEnabled: true,
      },
      rule: [
        {
          name: 'allow-specified-ips',
          priority: 0, // Highest priority
          action: {
            allow: {}
          },
          statement: {
            ip_set_reference_statement: {
              arn: this.ipSet.arn
            }
          },
          visibilityConfig: {
            cloudwatchMetricsEnabled: true,
            metricName: 'allow-specified-ips-metrics',
            sampledRequestsEnabled: true,
          }
        }
      ],
      tags: {
        ManagedBy: 'cdktf',
        ...config.tags
      },
      provider: this.getUsEast1Provider(scope)
    });

    this.webAclArn = this.webAcl.arn;
  }

  private formatIpAddress(ip: string): string {
    // Ensure IP is in CIDR format (e.g., 192.0.2.1/32)
    if (!ip.includes('/')) {
      return `${ip}/32`;
    }
    return ip;
  }

  private getUsEast1Provider(scope: Construct): any {
    // Get the us-east-1 provider from the stack
    const stack = scope.node.scopes.find(s => s instanceof TerraformStack) as TerraformStack;
    return {
      alias: 'us-east-1',
      provider: stack.node.tryFindChild('aws_us_east_1') as any
    };
  }
}